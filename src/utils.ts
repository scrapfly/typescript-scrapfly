import { log } from './logger.ts';
import type { Rec } from './types.ts';

export function urlsafe_b64encode(data: string): string {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(data);
  const base64 = btoa(String.fromCharCode(...encoded))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return base64;
}

export type RequestOptions = {
  url: string;
  method?: string;
  headers?: any;
  body?: string | Uint8Array;
};

export async function fetchRetry(
  config: RequestOptions,
  retries: number = 3,
  retryDelay: number = 1000,
): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // XXX: note that cloudflare workers don't support init options
      const { url, ...reqInit } = config;
      // The `body` field on RequestOptions is typed as string | Uint8Array for
      // historical reasons. The dnt (deno-to-node) build does not expose the
      // DOM `BodyInit` alias in every lib target, so we cast to `any` here to
      // stay portable across Deno, Node, Bun and Cloudflare Workers. The
      // runtime values (string | Uint8Array) are all valid fetch body inputs.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const init: RequestInit = {
        method: reqInit.method,
        headers: reqInit.headers,
        body: reqInit.body as any,
      };
      const response = await fetch(new Request(url, init));
      // retry 5xx status codes
      if (response.status >= 500 && response.status < 600) {
        const _text = await response.text(); // consume response to prevent leak
        lastError = new Error(`Fetch failed with status: ${response.status}`);
        if (attempt < retries) {
          log.debug(`request failed ${response.status} (${_text}): retry ${attempt}/${retries} after ${retryDelay}ms`);
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
      } else {
        return response;
      }
    } catch (error) {
      lastError = error;

      // AbortError should never be retried: it means the caller explicitly
      // gave up (cancel token, timeout, etc.) and we shouldn't paper over it.
      const isAbort = error instanceof Error && error.name === 'AbortError';
      if (attempt === retries || isAbort) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }

  throw lastError;
}

export function normalizeHeaders(headers: Rec<string> | Headers): Rec<string> {
  const normalizedHeaders: Rec<string> = {};

  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      normalizedHeaders[key.toLowerCase()] = value;
    });
  } else {
    Object.keys(headers).forEach((key) => {
      normalizedHeaders[key.toLowerCase()] = headers[key];
    });
  }

  return normalizedHeaders;
}
