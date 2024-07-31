import { log } from './logger.ts';

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
  let lastError: any = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // XXX: note that cloudflare workers don't support init options
      const { url, ...reqInit } = config;
      const response = await fetch(new Request(url, reqInit));
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

      if (attempt === retries || error.name === 'AbortError') {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }

  throw lastError;
}
