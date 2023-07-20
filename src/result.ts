import { Rec, HttpMethod } from "./types.js"

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
        details: Array<{ amount: number, code: string, description: string }>;
        total: number;
    }
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
        base_url: string,
        fragment?: string,
        host: string,
        params?: Rec<string>,
        port: number,
        query?: string,
        root_domain: string,
        scheme: string,
    },
    url: string;
    webhook?: string;
};

export type ResultData = {
    browser_data: {
        javascript_evaluation_result: string;
        js_scenario: Array<any>;  // TODO: type?
        local_storage_data: Array<any>;  // TODO: type?
        session_storage_data: Array<any>; // TODO: type?
        websockets: Array<any>;  // TODO: type?
        xhr_call: Array<any>; // Todo: type?
    },
    content: string;
    content_encoding: string;
    content_type: string;
    cookies: Array<any>; // TODO: type?
    data?: string; // TODO: type?
    dns?: any; // TODO: type?
    duration: number;
    error?: string;  // TODO: type?
    format: string;
    iframes: Array<any>; // TODO: type?
    log_url: string;
    reason: string;
    request_headers: Rec<string>;
    response_headers: Rec<string>;
    screenshots: Rec<{ css_selector?: string, extension: string, format: string, size: number; url: string }>;
    size: number;
    ssl?: any; // TODO: type?
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

    constructor(data: {
        config: ConfigData
        context: ContextData;
        result: ResultData;
        uuid: string;
    }) {
        this.config = data.config;
        this.context = data.context;
        this.result = data.result;
        this.uuid = data.uuid;
    }
}

export class AccountData {
    acount: {
        account_id: string,
        currency: string,
        timezone: string,
    };
    project: {
        allow_extra_usage: boolean,
        allowed_networks: Array<string>,
        budget_limit: any,
        budget_spent: any,
        concurrency_limit?: number,
        name: string,
        quota_reached: boolean,
        scrape_request_count: number,
        scrape_request_limit: number,
        tags: Array<string>,
    };
    subscription: {
        billing: {
            current_extra_scrape_request_price: { currency: string, amount: number },
            extra_scrape_request_price_per_10k: { currency: string, amount: number },
            ongoing_payment: { currency: string, amount: number },
            plan_price: { currency: string, amount: number },
        },
        extra_scrape_allowed: boolean,
        max_concurrency: number,
        period: {
            start: string,
            end: string,
        },
        plan_name: string,
        usage: {
            schedule: { current: number, limit: number },
            spider: { current: number, limit: number },
            scrape: {
                concurrent_limit: number,
                concurrent_remaining: number,
                concurrent_usage: number,
                current: number,
                extra: number,
                limit: number,
                remaining: number
            },
        }
    }
}