/**
 * Retrieve the files a Cloud Browser session downloaded.
 *
 * Connect with `new BrowserConfig({ downloads_stream: true })`: `ScrapiumBrowser.getDownloads` then returns
 * each small file inline and each large one as an IO stream handle, which these helpers read in chunks with
 * `IO.read`, so no CDP message is larger than one chunk. Without the option every file comes back inline,
 * and the helpers read that shape too.
 *
 * A session is anything with a `send(method, params)` method answering the CDP result: Puppeteer's and
 * Playwright's `CDPSession`, a chrome-remote-interface client, or such a function.
 *
 * ```ts
 * const downloads = new CloudBrowserDownloads(await page.createCDPSession());
 * await downloads.waitFor('report.pdf');
 * const paths = await downloads.saveAll('downloads');
 * ```
 */
import { mkdir, open, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';

/** Base64 characters per `IO.read`: an 8 MiB message carrying 6 MiB of the file. */
export const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024;
/** The largest chunk the Cloud Browser serves per `IO.read`. */
export const MAX_CHUNK_SIZE = 32 * 1024 * 1024;

const DEFAULT_WAIT_TIMEOUT_MS = 60_000;
const DEFAULT_WAIT_INTERVAL_MS = 500;

/** A CDP session: Puppeteer's or Playwright's `CDPSession`, or a chrome-remote-interface client. */
export interface CdpSession {
  // deno-lint-ignore no-explicit-any
  send(method: any, params?: any): Promise<any>;
}

/** A function sending one CDP command and resolving to its result. */
// deno-lint-ignore no-explicit-any
export type CdpSend = (method: string, params?: Record<string, unknown>) => Promise<any>;

/**
 * One file of the session's download directory. A small file carries its base64 content in `data`. A large
 * one, with `downloads_stream`, carries the IO handle to read in `stream` instead, and its size in bytes.
 */
export interface BrowserDownload {
  name: string;
  guid?: string;
  size?: number;
  data?: string;
  stream?: string;
}

/** A download could not be read whole. */
export class BrowserDownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrowserDownloadError';
  }
}

interface StreamEntry {
  stream: string;
  size?: number;
  name?: string;
}

interface GetDownloadsResult {
  files?: Record<string, string>;
  files_by_guid?: Record<string, string>;
  guid_names?: Record<string, string>;
  streams?: Record<string, StreamEntry>;
}

/** The downloads of a `ScrapiumBrowser.getDownloads` result, in either of its shapes. */
export function parseDownloads(result: GetDownloadsResult): BrowserDownload[] {
  const downloads: BrowserDownload[] = [];
  if (result.guid_names !== undefined || result.streams !== undefined) {
    const guidNames = result.guid_names ?? {};
    for (const [guid, data] of Object.entries(result.files_by_guid ?? {})) {
      downloads.push({ name: guidNames[guid] || guid, guid, size: decodedSize(data), data });
    }
    for (const [guid, entry] of Object.entries(result.streams ?? {})) {
      downloads.push({ name: entry.name || guidNames[guid] || guid, guid, size: entry.size, stream: entry.stream });
    }
    // A file on disk with no download GUID, such as one finished before this session attached.
    for (const [name, data] of Object.entries(result.files ?? {})) {
      downloads.push({ name, size: decodedSize(data), data });
    }
    return downloads;
  }

  // Without downloads_stream every file is inline under `files`, and again under `files_by_guid` with no
  // name: `files` alone holds each file once.
  for (const [name, data] of Object.entries(result.files ?? {})) {
    downloads.push({ name, size: decodedSize(data), data });
  }
  return downloads;
}

function decodedSize(data: string): number {
  let padding = 0;
  if (data.endsWith('==')) {
    padding = 2;
  } else if (data.endsWith('=')) {
    padding = 1;
  }
  return Math.floor(data.length / 4) * 3 - padding;
}

function decodeBase64(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function checkChunkSize(chunkSize: number): number {
  if (!Number.isInteger(chunkSize) || chunkSize < 4 || chunkSize > MAX_CHUNK_SIZE) {
    throw new RangeError(`chunkSize must be an integer between 4 and ${MAX_CHUNK_SIZE} base64 characters`);
  }
  return chunkSize - (chunkSize % 4);
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function targetPath(download: BrowserDownload, path?: string): Promise<string> {
  // The name comes from the remote browser: keep its last component only.
  const name = basename(download.name.replaceAll('\\', '/')) || download.guid || 'download';
  if (path === undefined) {
    return name;
  }
  if (await isDirectory(path)) {
    return join(path, name);
  }
  return path;
}

export interface CloudBrowserDownloadsOptions {
  /** Base64 characters per `IO.read`, rounded down to a multiple of 4. Defaults to 8 MiB, 32 MiB at most. */
  chunkSize?: number;
}

export interface WaitForOptions {
  /** Milliseconds before giving up. Defaults to 60000. */
  timeout?: number;
  /** Milliseconds between two checks. Defaults to 500. */
  interval?: number;
}

/** Download helpers over a CDP session of a Cloud Browser. */
export class CloudBrowserDownloads {
  readonly chunkSize: number;
  private readonly sendCommand: CdpSend;

  constructor(session: CdpSession | CdpSend, options: CloudBrowserDownloadsOptions = {}) {
    if (typeof session === 'function') {
      this.sendCommand = session;
    } else {
      this.sendCommand = (method, params) => session.send(method, params);
    }
    this.chunkSize = checkChunkSize(options.chunkSize ?? DEFAULT_CHUNK_SIZE);
  }

  /** The size in bytes of every completed download, by filename. */
  async metadata(): Promise<Record<string, number>> {
    const reply = await this.sendCommand('ScrapiumBrowser.getDownloadsMetadatas', {});
    return reply?.metadata ?? {};
  }

  /** Wait until `filename` is listed with the same size twice in a row, and resolve to that size. */
  async waitFor(filename: string, options: WaitForOptions = {}): Promise<number> {
    const timeout = options.timeout ?? DEFAULT_WAIT_TIMEOUT_MS;
    const interval = options.interval ?? DEFAULT_WAIT_INTERVAL_MS;
    const deadline = Date.now() + timeout;
    let last = -1;
    while (Date.now() < deadline) {
      const size = (await this.metadata())[filename] ?? -1;
      if (size >= 0 && size === last) {
        return size;
      }
      last = size;
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    throw new Error(`${filename} did not finish downloading in ${timeout}ms`);
  }

  /** Every download of the session: small ones with their content, large ones as handles. */
  async list(): Promise<BrowserDownload[]> {
    return parseDownloads(await this.sendCommand('ScrapiumBrowser.getDownloads', {}));
  }

  /** The bytes of a download, one decoded chunk at a time. A stream handle is read once. */
  async *chunks(download: BrowserDownload): AsyncGenerator<Uint8Array> {
    if (download.stream === undefined) {
      yield decodeBase64(download.data ?? '');
      return;
    }
    let written = 0;
    try {
      while (true) {
        const reply = await this.sendCommand('IO.read', { handle: download.stream, size: this.chunkSize });
        const data: string = reply?.data ?? '';
        if (data.length > 0) {
          const chunk = reply.base64Encoded === false ? new TextEncoder().encode(data) : decodeBase64(data);
          written += chunk.length;
          yield chunk;
        }
        if (reply?.eof) {
          break;
        }
      }
    } finally {
      await this.sendCommand('IO.close', { handle: download.stream });
    }
    if (download.size !== undefined && written !== download.size) {
      throw new BrowserDownloadError(`${download.name}: read ${written} bytes, expected ${download.size}`);
    }
  }

  /** The whole content of a download, in memory. */
  async read(download: BrowserDownload): Promise<Uint8Array> {
    const parts: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of this.chunks(download)) {
      parts.push(chunk);
      total += chunk.length;
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.length;
    }
    return bytes;
  }

  /** Write a download to `path` (a file or a directory, the current one by default) chunk by chunk. */
  async save(download: BrowserDownload, path?: string): Promise<string> {
    const target = await targetPath(download, path);
    const file = await open(target, 'w');
    try {
      for await (const chunk of this.chunks(download)) {
        await file.write(chunk);
      }
    } finally {
      await file.close();
    }
    return target;
  }

  /** Write every download of the session into `directory` and resolve to their paths. */
  async saveAll(directory = '.'): Promise<string[]> {
    await mkdir(directory, { recursive: true });
    const paths: string[] = [];
    for (const download of await this.list()) {
      paths.push(await this.save(download, directory));
    }
    return paths;
  }
}
