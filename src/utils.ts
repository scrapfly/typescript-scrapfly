export function urlsafe_b64encode(data: string): string {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(data);
  const base64 = btoa(String.fromCharCode(...encoded))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return base64;
}

export async function fetchRetry(
  config: Request,
  init: RequestInit = {},
  retries: number = 3,
  retryDelay: number = 1000,
  timeout: number = 160000, // Timeout in milliseconds
): Promise<Response> {
  let lastError: any = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // XXX: this breaks cloudflare workers as they don't support init options
      const response = await fetch(config, { ...init, signal: controller.signal });
      clearTimeout(timeoutId);
      // retry 5xx status codes
      if (response.status >= 500 && response.status < 600) {
        lastError = new Error(`Fetch failed with status: ${response.status}`);
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
      } else {
        return response;
      }
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;

      if (attempt === retries || error.name === 'AbortError') {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }

  throw lastError;
}
