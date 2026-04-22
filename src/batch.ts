/**
 * Streaming multipart/mixed parser for POST /scrape/batch.
 *
 * The API emits one part per scrape as each completes. This module
 * reads the response body as a ReadableStream and yields
 * `(headers, body)` pairs as each part lands.
 *
 * No external dependencies — uses Web Streams (native in Node 18+
 * and all modern browsers).
 */

const CR = 0x0d;
const LF = 0x0a;
const CRLF = new Uint8Array([CR, LF]);
const DOUBLE_CRLF = new Uint8Array([CR, LF, CR, LF]);

function indexOf(buf: Uint8Array, needle: Uint8Array, start = 0): number {
  if (needle.length === 0) return start;
  const last = buf.length - needle.length;
  outer: for (let i = start; i <= last; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (buf[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function parseContentType(value: string): { mime: string; params: Record<string, string> } {
  const semi = value.indexOf(';');
  if (semi < 0) return { mime: value.trim().toLowerCase(), params: {} };
  const mime = value.slice(0, semi).trim().toLowerCase();
  const params: Record<string, string> = {};
  for (const piece of value.slice(semi + 1).split(';')) {
    const eq = piece.indexOf('=');
    if (eq < 0) continue;
    const k = piece.slice(0, eq).trim().toLowerCase();
    let v = piece.slice(eq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    params[k] = v;
  }
  return { mime, params };
}

export interface BatchPart {
  headers: Record<string, string>;
  body: Uint8Array;
}

/**
 * Async iterator over multipart/mixed parts from a fetch Response.
 *
 * Yields one `BatchPart` per multipart section as it arrives on the
 * wire. Throws if the response Content-Type is not multipart/mixed
 * or the boundary is missing.
 */
export async function* iterBatchParts(response: Response): AsyncGenerator<BatchPart> {
  const ct = response.headers.get('content-type') ?? '';
  const { mime, params } = parseContentType(ct);
  if (mime !== 'multipart/mixed') {
    throw new Error(`scrapeBatch: expected Content-Type multipart/mixed, got ${JSON.stringify(ct)}`);
  }
  const boundaryStr = params['boundary'];
  if (!boundaryStr) {
    throw new Error(`scrapeBatch: Content-Type multipart/mixed is missing boundary parameter: ${JSON.stringify(ct)}`);
  }
  if (!response.body) {
    throw new Error('scrapeBatch: response has no body stream');
  }

  const boundary = new TextEncoder().encode('--' + boundaryStr);
  const nextBoundarySep = new TextEncoder().encode('\r\n--' + boundaryStr);
  const reader = response.body.getReader();

  let buf = new Uint8Array(0);
  let eof = false;
  let pastPrefix = false;

  const pump = async (): Promise<boolean> => {
    if (eof) return false;
    const { done, value } = await reader.read();
    if (done) {
      eof = true;
      return false;
    }
    if (value && value.length > 0) {
      // reader.read() returns Uint8Array<ArrayBufferLike> on newer Deno/TS
      // lib types while dnt's Node target still sees Uint8Array as
      // non-generic. Cast to the non-generic form so the same source
      // type-checks on both targets.
      buf = concat(buf, value as unknown as Uint8Array);
      return true;
    }
    return false;
  };

  const readUntil = async (needle: Uint8Array): Promise<Uint8Array> => {
    while (true) {
      const idx = indexOf(buf, needle);
      if (idx !== -1) {
        const out = buf.subarray(0, idx);
        buf = buf.subarray(idx + needle.length);
        return out;
      }
      if (eof) {
        const out = buf;
        buf = new Uint8Array(0);
        return out;
      }
      if (!(await pump())) {
        const out = buf;
        buf = new Uint8Array(0);
        return out;
      }
    }
  };

  const readExact = async (n: number): Promise<Uint8Array> => {
    while (buf.length < n && !eof) {
      await pump();
    }
    const out = buf.subarray(0, Math.min(n, buf.length));
    buf = buf.subarray(out.length);
    return out;
  };

  while (true) {
    if (!pastPrefix) {
      await readUntil(boundary);
      pastPrefix = true;
    }
    // After each --boundary, expect CRLF (more parts) or `--` (terminator).
    // RFC 2046 mandates CRLF; any server deviating from that is broken —
    // return cleanly rather than try to guess.
    const suffix = await readExact(2);
    if (suffix.length < 2) return;
    if (suffix[0] === 0x2d && suffix[1] === 0x2d) {
      // Final boundary marker "--"
      return;
    }
    if (!(suffix[0] === CR && suffix[1] === LF)) {
      return;
    }

    // Read headers up to blank line (CRLF CRLF).
    const headerBlock = await readUntil(DOUBLE_CRLF);
    const headers: Record<string, string> = {};
    for (const lineBytes of splitByCRLF(headerBlock)) {
      const line = new TextDecoder('utf-8').decode(lineBytes);
      const colon = line.indexOf(':');
      if (colon <= 0) continue;
      headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
    }

    // Body framing: prefer Content-Length (server always emits it).
    // When Content-Length is known, yield the part IMMEDIATELY after
    // reading the body bytes — don't wait for the next boundary
    // separator to arrive. Otherwise the caller is blocked until
    // part N+1 starts streaming, which defeats the whole point of
    // per-part streaming (especially when scrape N+1 is a slow one).
    let body: Uint8Array;
    const cl = headers['content-length'];
    let readSeparatorAfterYield = false;
    if (cl && /^\d+$/.test(cl)) {
      body = await readExact(parseInt(cl, 10));
      readSeparatorAfterYield = true;
    } else {
      body = await readUntil(nextBoundarySep);
    }

    yield { headers, body };

    // With Content-Length framing, the "\r\n--<boundary>" separator
    // follows the body but is not part of it. Consume it now — any
    // blocking that happens here blocks the NEXT iteration, not this
    // part's delivery.
    if (readSeparatorAfterYield) {
      await readUntil(nextBoundarySep);
    }
  }
}

function splitByCRLF(buf: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = [];
  let start = 0;
  for (let i = 0; i < buf.length - 1; i++) {
    if (buf[i] === CR && buf[i + 1] === LF) {
      out.push(buf.subarray(start, i));
      start = i + 2;
      i++;
    }
  }
  if (start < buf.length) out.push(buf.subarray(start));
  return out;
}

// msgpack decoder. The module is npm:@msgpack/msgpack — dnt rewrites
// this to a regular npm import in the published package.
import { decode as msgpackDecode } from 'npm:@msgpack/msgpack@3.0.0';

/**
 * Decode a part body according to its content-type header. Supports
 * both application/json (default) and application/msgpack.
 */
export function decodePartBody<T = unknown>(part: BatchPart): T {
  const ct = part.headers['content-type'] ?? 'application/json';
  if (ct.startsWith('application/json')) {
    return JSON.parse(new TextDecoder('utf-8').decode(part.body)) as T;
  }
  if (ct.startsWith('application/msgpack') || ct.startsWith('application/x-msgpack')) {
    return msgpackDecode(part.body) as T;
  }
  throw new Error(`scrapeBatch: unsupported part Content-Type: ${ct}`);
}

// Header prefix used by the server to forward upstream response
// headers on proxified batch parts (avoids collision with the
// multipart envelope's own headers).
const UPSTREAM_PREFIX = 'x-scrapfly-upstream-';

/**
 * Synthesize a native fetch `Response` from a proxified batch part.
 * The part body is the raw upstream bytes and the part carries:
 *   * `Content-Type` — the upstream's content-type
 *   * `X-Scrapfly-Scrape-Status` — the upstream's HTTP status
 *   * `X-Scrapfly-Upstream-<Name>` — upstream response headers
 *   * `X-Scrapfly-Log-Uuid`, `X-Scrapfly-Content-Format` — scrapfly metadata
 *
 * We return a Response with those values restored so the caller
 * gets the same shape as a single proxified scrape.
 */
export function buildProxifiedResponseFromPart(part: BatchPart): Response {
  const statusHeader = part.headers['x-scrapfly-scrape-status'];
  const status = statusHeader ? parseInt(statusHeader, 10) || 200 : 200;

  const headers = new Headers();
  for (const [key, value] of Object.entries(part.headers)) {
    const lower = key.toLowerCase();
    if (lower === 'content-type') {
      headers.set('Content-Type', value);
    } else if (lower.startsWith(UPSTREAM_PREFIX)) {
      headers.set(key.slice(UPSTREAM_PREFIX.length), value);
    } else if (lower.startsWith('x-scrapfly-')) {
      headers.set(key, value);
    }
  }

  // Normalize X-Scrapfly-Log-Uuid → X-Scrapfly-Log for parity with
  // the single-scrape proxified response headers.
  if (!headers.has('X-Scrapfly-Log') && headers.has('X-Scrapfly-Log-Uuid')) {
    headers.set('X-Scrapfly-Log', headers.get('X-Scrapfly-Log-Uuid') ?? '');
  }

  // Wrap the Uint8Array in an ArrayBuffer so fetch Response accepts
  // it (Node's fetch is picky about BodyInit).
  // Copy into a fresh ArrayBuffer to avoid SharedArrayBuffer edge
  // cases when the underlying bytes came from a larger buffer.
  const bodyBuffer = new Uint8Array(part.body.length);
  bodyBuffer.set(part.body);

  return new Response(bodyBuffer, {
    status,
    headers,
  });
}
