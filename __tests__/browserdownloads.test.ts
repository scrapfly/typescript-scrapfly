import { BrowserConfig } from '../src/browserconfig.ts';
import {
  BrowserDownloadError,
  CloudBrowserDownloads,
  MAX_CHUNK_SIZE,
  parseDownloads,
} from '../src/browserdownloads.ts';
import { assert, assertEquals, assertRejects, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const SMALL = new TextEncoder().encode('%PDF-1.7 small inline file');
// Not a multiple of 3 bytes, so its base64 ends with padding and the last chunk is short.
const LARGE = (() => {
  const bytes = new Uint8Array(3 * 1024 * 1024 + 7);
  for (let offset = 0; offset < bytes.length; offset += 65536) {
    crypto.getRandomValues(bytes.subarray(offset, Math.min(offset + 65536, bytes.length)));
  }
  return bytes;
})();

function b64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  }
  return btoa(binary);
}

const LARGE_B64 = b64(LARGE);

type Params = Record<string, unknown>;

/** The Cloud Browser's side of the download commands, as a CDP session answers them. */
class FakeBrowser {
  calls: Array<[string, Params]> = [];
  metadataPolls = 0;
  readyAfter = 0;
  streams = new Map<string, { data: string; off: number }>();

  constructor(public streamed = true, public orphans: Record<string, Uint8Array> = {}) {}

  answer(method: string, params: Params = {}): Params {
    this.calls.push([method, params]);
    if (method === 'ScrapiumBrowser.getDownloadsMetadatas') {
      this.metadataPolls++;
      if (this.metadataPolls <= this.readyAfter) return { metadata: {} };
      return { metadata: { 'small.pdf': SMALL.length, 'large.bin': LARGE.length } };
    }
    if (method === 'ScrapiumBrowser.getDownloads') return this.getDownloads();
    if (method === 'IO.read') return this.read(params);
    if (method === 'IO.close') {
      this.streams.delete(params.handle as string);
      return {};
    }
    throw new Error(`unexpected command ${method}`);
  }

  getDownloads(): Params {
    const files = { 'small.pdf': b64(SMALL), 'large.bin': LARGE_B64 };
    if (!this.streamed) {
      return { files, files_by_guid: { 'GUID-SMALL': files['small.pdf'], 'GUID-LARGE': files['large.bin'] } };
    }
    this.streams.set('scrapfly-download:1', { data: LARGE_B64, off: 0 });
    const orphans: Record<string, string> = {};
    for (const [name, raw] of Object.entries(this.orphans)) orphans[name] = b64(raw);
    return {
      files: orphans,
      files_by_guid: { 'GUID-SMALL': files['small.pdf'] },
      guid_names: { 'GUID-SMALL': 'small.pdf', 'GUID-LARGE': 'large.bin' },
      streams: { 'GUID-LARGE': { stream: 'scrapfly-download:1', size: LARGE.length, name: 'large.bin' } },
    };
  }

  read(params: Params): Params {
    if ('offset' in params) throw new Error('download streams are sequential: IO.read offset is not supported');
    const stream = this.streams.get(params.handle as string);
    if (stream === undefined) throw new Error(`Invalid stream handle: ${params.handle}`);
    let size = Math.min((params.size as number) || 4 * 1024 * 1024, MAX_CHUNK_SIZE);
    size -= size % 4;
    const start = stream.off;
    const end = Math.min(start + size, stream.data.length);
    stream.off = end;
    const eof = end >= stream.data.length;
    if (eof) this.streams.delete(params.handle as string);
    return { data: stream.data.slice(start, end), base64Encoded: true, eof };
  }

  reads(): Params[] {
    return this.calls.filter(([method]) => method === 'IO.read').map(([, params]) => params);
  }

  closes(): string[] {
    return this.calls.filter(([method]) => method === 'IO.close').map(([, params]) => params.handle as string);
  }
}

/** Shaped like Puppeteer's and Playwright's CDPSession: send(method, params) resolves to the result. */
function session(browser: FakeBrowser) {
  return {
    send: async (method: string, params?: Params) => {
      await Promise.resolve();
      return browser.answer(method, params);
    },
  };
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

async function streamedDownload(downloads: CloudBrowserDownloads) {
  const listed = await downloads.list();
  return listed.find((download) => download.stream !== undefined)!;
}

Deno.test('BrowserConfig: downloads_stream is sent on the websocket url', () => {
  assert(new BrowserConfig({ downloads_stream: true }).websocketUrl('key').includes('downloads_stream=true'));
  assert(!new BrowserConfig().websocketUrl('key').includes('downloads_stream'));
});

Deno.test('parseDownloads: streamed shape lists small files inline and large ones as handles', () => {
  const downloads = parseDownloads(
    new FakeBrowser(true, { 'early.txt': new TextEncoder().encode('before attach') }).getDownloads(),
  );
  const byName = Object.fromEntries(downloads.map((download) => [download.name, download]));
  assertEquals(Object.keys(byName).sort(), ['early.txt', 'large.bin', 'small.pdf']);
  assertEquals(byName['small.pdf'].stream, undefined);
  assertEquals(byName['small.pdf'].size, SMALL.length);
  assertEquals(byName['small.pdf'].guid, 'GUID-SMALL');
  assertEquals(byName['large.bin'].stream, 'scrapfly-download:1');
  assertEquals(byName['large.bin'].size, LARGE.length);
  assertEquals(byName['early.txt'].guid, undefined);
  assertEquals(byName['early.txt'].size, 'before attach'.length);
});

Deno.test('parseDownloads: default shape lists each file once', () => {
  const downloads = parseDownloads(new FakeBrowser(false).getDownloads());
  assertEquals(downloads.map((download) => download.name).sort(), ['large.bin', 'small.pdf']);
  assert(downloads.every((download) => download.stream === undefined));
});

Deno.test('saveAll writes every file and reads a handle in chunks', async () => {
  const dir = await Deno.makeTempDir();
  const browser = new FakeBrowser(true, { 'early.txt': new TextEncoder().encode('before attach') });
  const downloads = new CloudBrowserDownloads(session(browser), { chunkSize: 1024 * 1024 });

  const paths = await downloads.saveAll(dir);

  assertEquals(paths.map((path) => path.split('/').pop()).sort(), ['early.txt', 'large.bin', 'small.pdf']);
  assert(equalBytes(await Deno.readFile(`${dir}/small.pdf`), SMALL));
  assertEquals(new TextDecoder().decode(await Deno.readFile(`${dir}/early.txt`)), 'before attach');
  assert(equalBytes(await Deno.readFile(`${dir}/large.bin`), LARGE));
  const reads = browser.reads();
  assertEquals(reads.length, Math.ceil(LARGE_B64.length / (1024 * 1024)));
  assert(reads.every((read) => read.handle === 'scrapfly-download:1' && read.size === 1024 * 1024));
  assertEquals(browser.closes(), ['scrapfly-download:1']);
  await Deno.remove(dir, { recursive: true });
});

Deno.test('a chunk size off the base64 grid is rounded down', async () => {
  const browser = new FakeBrowser();
  const downloads = new CloudBrowserDownloads(session(browser), { chunkSize: 1000003 });
  assert(equalBytes(await downloads.read(await streamedDownload(downloads)), LARGE));
  assertEquals([...new Set(browser.reads().map((read) => read.size))], [1000000]);
});

Deno.test('a chunk size outside the served range is refused', () => {
  assertThrows(() => new CloudBrowserDownloads(session(new FakeBrowser()), { chunkSize: MAX_CHUNK_SIZE + 4 }), RangeError);
  assertThrows(() => new CloudBrowserDownloads(session(new FakeBrowser()), { chunkSize: 2 }), RangeError);
});

Deno.test('default shape saves without any IO.read', async () => {
  const dir = await Deno.makeTempDir();
  const browser = new FakeBrowser(false);
  await new CloudBrowserDownloads(session(browser)).saveAll(dir);
  assert(equalBytes(await Deno.readFile(`${dir}/large.bin`), LARGE));
  assertEquals(browser.reads(), []);
  await Deno.remove(dir, { recursive: true });
});

Deno.test('a short stream rejects and still closes the handle', async () => {
  const browser = new FakeBrowser();
  const downloads = new CloudBrowserDownloads(session(browser));
  const large = await streamedDownload(downloads);
  large.size = LARGE.length + 1;
  await assertRejects(() => downloads.read(large), BrowserDownloadError);
  assertEquals(browser.closes(), ['scrapfly-download:1']);
});

Deno.test('a failed read still closes the handle', async () => {
  const browser = new FakeBrowser();
  const downloads = new CloudBrowserDownloads(session(browser));
  const large = await streamedDownload(downloads);
  large.stream = 'scrapfly-download:404';
  await assertRejects(() => downloads.read(large), Error, 'Invalid stream handle');
  assertEquals(browser.closes(), ['scrapfly-download:404']);
});

Deno.test('stopping early closes the handle', async () => {
  const browser = new FakeBrowser();
  const downloads = new CloudBrowserDownloads(session(browser), { chunkSize: 1024 * 1024 });
  for await (const _chunk of downloads.chunks(await streamedDownload(downloads))) {
    break;
  }
  assertEquals(browser.closes(), ['scrapfly-download:1']);
});

Deno.test('a remote name cannot leave the target directory', async () => {
  const dir = await Deno.makeTempDir();
  const browser = new FakeBrowser(true, { '../../escape.txt': new Uint8Array([120]) });
  const paths = await new CloudBrowserDownloads(session(browser)).saveAll(dir);
  assert(paths.includes(`${dir}/escape.txt`));
  await assertRejects(() => Deno.stat(`${dir}/../escape.txt`), Deno.errors.NotFound);
  await Deno.remove(dir, { recursive: true });
});

Deno.test('save to an explicit file', async () => {
  const dir = await Deno.makeTempDir();
  const downloads = new CloudBrowserDownloads(session(new FakeBrowser()));
  const small = (await downloads.list()).find((download) => download.name === 'small.pdf')!;
  assertEquals(await downloads.save(small, `${dir}/renamed.pdf`), `${dir}/renamed.pdf`);
  assert(equalBytes(await Deno.readFile(`${dir}/renamed.pdf`), SMALL));
  await Deno.remove(dir, { recursive: true });
});

Deno.test('waitFor resolves once the size settles', async () => {
  const browser = new FakeBrowser();
  browser.readyAfter = 2;
  const size = await new CloudBrowserDownloads(session(browser)).waitFor('large.bin', { timeout: 5000, interval: 0 });
  assertEquals(size, LARGE.length);
  assertEquals(browser.metadataPolls, 4);
});

Deno.test('waitFor rejects on a file never listed', async () => {
  await assertRejects(
    () => new CloudBrowserDownloads(session(new FakeBrowser())).waitFor('missing.bin', { timeout: 50, interval: 10 }),
    Error,
    'did not finish downloading',
  );
});

Deno.test('a plain function is a session', async () => {
  const browser = new FakeBrowser();
  const downloads = new CloudBrowserDownloads((method, params) => Promise.resolve(browser.answer(method, params)));
  assert(equalBytes(await downloads.read(await streamedDownload(downloads)), LARGE));
});
