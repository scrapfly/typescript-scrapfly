import type { HttpMethod, Rec } from './types.ts';
import * as errors from './errors.ts';
import { cheerio } from './deps.ts';

export type ConfigData = {
  url: string;
  retry: boolean;
  method: HttpMethod;
  country?: string;
  render_js: boolean;
  cache: boolean;
  cache_clear: boolean;
  ssl: boolean;
  dns: boolean;
  asp: boolean;
  debug: boolean;
  raise_on_upstream_error: boolean;
  cache_ttl: number;
  proxy_pool: string;
  session?: string;
  tags: Set<string>;
  correlation_id?: string;
  cookies: Record<string, string>;
  body?: string;
  data?: Rec<any>;
  headers: Rec<string>;
  js?: string;
  rendering_wait?: number;
  wait_for_selector?: string;
  session_sticky_proxy: boolean;
  screenshots?: Rec<any>;
  webhook?: string;
  timeout?: number; // in milliseconds
  js_scenario?: Rec<any>;
  extract?: Rec<any>;
  lang?: string[];
  os?: string;
  auto_scroll?: boolean;
};

export type ContextData = {
  asp: boolean;
  bandwidth_consumed: number;
  cache: {
    state: string;
    entry?: string;
  };
  cookies: Record<string, string>;
  cost: {
    details: Array<{ amount: number; code: string; description: string }>;
    total: number;
  };
  created_at: string;
  debug: {
    response_url: string;
    screenshot_url?: string;
  };
  env: string;
  fingerprint: string;
  headers: Record<string, string>;
  is_xml_http_request: boolean;
  job?: string;
  lang: Array<string>;
  os: {
    distribution: string;
    name: string;
    type: string;
    version: string;
  };
  project: string;
  proxy: {
    country: string;
    identity: string;
    network: string;
    pool: string;
  };
  redirects: Array<string>;
  retry: number;
  schedule?: string;
  session?: string;
  spider?: any;
  throttler?: any;
  uri: {
    base_url: string;
    fragment?: string;
    host: string;
    params?: Rec<string>;
    port: number;
    query?: string;
    root_domain: string;
    scheme: string;
  };
  url: string;
  webhook?: string;
};

export type ResultData = {
  browser_data: {
    javascript_evaluation_result?: string;
    js_scenario?: {
      duration: number;
      executed: number;
      response: any;
      steps: Array<{
        action: string;
        config: Rec<string>;
        duration: number;
        executed: boolean;
        result?: string;
        success: boolean;
      }>;
    };
    local_storage_data?: Rec<string>;
    session_storage_data?: Rec<string>;
    websockets?: Array<any>;
    xhr_call?: Array<{
      body?: string;
      headers: Rec<string>;
      method: string;
      type: string;
      url: string;
      response: {
        body: string;
        duration: number;
        format: string;
        headers: Rec<string>;
        status: number;
      };
    }>;
  };
  content: string;
  content_encoding: string;
  content_type: string;
  cookies: Array<{
    name: string;
    value: string;
    expires: string;
    path: string;
    comment: string;
    domain: string;
    max_age: number;
    secure: boolean;
    http_only: boolean;
    version: string;
    size: number;
  }>;
  data?: Rec<any>;
  dns?: Rec<Array<Rec<any>>>;
  duration: number;
  error?: {
    code: string;
    http_code: number;
    links: Rec<string>;
    message: string;
    retryable: boolean;
    doc_url?: string;
  };
  format: string;
  iframes: Array<{
    url: string;
    uri: {
      root_domain: string;
      base_url: string;
      host: string;
      scheme: string;
      query?: string;
      fragment?: string;
      port: number;
      params?: Rec<string>;
    };
    content: string;
  }>;
  log_url: string;
  reason: string;
  request_headers: Rec<string>;
  response_headers: Rec<string>;
  screenshots: Rec<{
    css_selector?: string;
    extension: string;
    format: string;
    size: number;
    url: string;
  }>;
  size: number;
  ssl?: {
    certs: Array<Rec<any>>;
  };
  status: string;
  status_code: number;
  success: boolean;
  url: string;
};

export class ScrapeResult {
  config: ConfigData;
  context: ContextData;
  result: ResultData;
  uuid: string;
  private _selector: cheerio.CheerioAPI | undefined;

  constructor(data: { config: ConfigData; context: ContextData; result: ResultData; uuid: string }) {
    this.config = data.config;
    this.context = data.context;
    this.result = data.result;
    this.uuid = data.uuid;
    this._selector = undefined;
  }

  get selector(): cheerio.CheerioAPI {
    if (!this._selector) {
      if (!this.result.response_headers['content-type'].includes('text/html')) {
        throw new errors.ContentTypeError(
          `Cannot use selector on non-html content-type, received: ${this.result.response_headers['content-type']}`,
        );
      }
      this._selector = cheerio.load(this.result.content);
    }
    return this._selector;
  }
}

export type ScrapeResultData = Record<string | number | symbol, never>;

export type AccountData = {
  account: {
    account_id: string;
    currency: string;
    timezone: string;
  };
  project: {
    allow_extra_usage: boolean;
    allowed_networks: Array<string>;
    budget_limit: any;
    budget_spent: any;
    concurrency_limit?: number;
    name: string;
    quota_reached: boolean;
    scrape_request_count: number;
    scrape_request_limit: number;
    tags: Array<string>;
  };
  subscription: {
    billing: {
      current_extra_scrape_request_price: { currency: string; amount: number };
      extra_scrape_request_price_per_10k: { currency: string; amount: number };
      ongoing_payment: { currency: string; amount: number };
      plan_price: { currency: string; amount: number };
    };
    extra_scrape_allowed: boolean;
    max_concurrency: number;
    period: {
      start: string;
      end: string;
    };
    plan_name: string;
    usage: {
      schedule: { current: number; limit: number };
      spider: { current: number; limit: number };
      scrape: {
        concurrent_limit: number;
        concurrent_remaining: number;
        concurrent_usage: number;
        current: number;
        extra: number;
        limit: number;
        remaining: number;
      };
    };
  };
};

export type ScreenshotMetadata = {
  extension_name: string;
  upstream_status_code: number;
  upstream_url: string;
};

export class ScreenshotResult {
  image: ArrayBuffer;
  metadata: ScreenshotMetadata;
  result: object | null;

  constructor(response: Response, data: ArrayBuffer) {
    this.image = data;
    this.metadata = this.defineMetadata(response);
    this.result = this.decodeResponse(response, data); // raw result
  }

  private defineMetadata(response: Response): ScreenshotMetadata {
    const contentType = response.headers.get('content-type');
    let extension_name = '';
    if (contentType) {
      extension_name = contentType.split('/')[1].split(';')[0];
    }
    return {
      extension_name: extension_name,
      upstream_status_code: parseInt(response.headers.get('X-Scrapfly-Upstream-Http-Code') || '200', 10),
      upstream_url: response.headers.get('X-Scrapfly-Upstream-Url') || '',
    };
  }

  private decodeResponse(response: Response, data: ArrayBuffer): object | null {
    if (response.headers.get('content-type') === 'json') {
      return JSON.parse(new TextDecoder().decode(data));
    }
    return null;
  }
}

export class ExtractionResult {
  data: string;
  content_type: string;
  data_quality?: string;

  constructor(response: { data: string; content_type: string; data_quality?: string }) {
    this.data = response.data;
    this.content_type = response.content_type;
    this.data_quality = response.data_quality;
  }
}
