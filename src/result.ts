import { Optional, Rec, HttpMethod } from "./types.js"

export type ConfigData = {
    url: string;
    retry: boolean;
    method: HttpMethod;
    country: Optional<string>;
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
    session: Optional<string>;
    tags: Set<string>;
    correlation_id: Optional<string>;
    cookies: Record<string, string>;
    body: Optional<string>;
    data: Optional<Rec<any>>;
    headers: Rec<string>;
    js: Optional<string>;
    rendering_wait: Optional<number>;
    wait_for_selector: Optional<string>;
    session_sticky_proxy: boolean;
    screenshots: Optional<Rec<any>>;
    webhook: Optional<string>;
    timeout: Optional<number>; // in milliseconds
    js_scenario: Optional<Rec<any>>;
    extract: Optional<Rec<any>>;
    lang: Optional<string[]>;
    os: Optional<string>;
    auto_scroll: Optional<boolean>;
};

export type ContextData = {
    asp: boolean;
    bandwidth_consumed: number;
    cache: {
        state: string;
        entry: Optional<string>;
    };
    cookies: Record<string, string>;
    cost: {
        details: Array<{ amount: number, code: string, description: string }>;
        total: number;
    }
    created_at: string;
    debug: {
        response_url: string;
        screenshot_url: Optional<string>;
    };
    env: string;
    fingerprint: string;
    headers: Record<string, string>;
    is_xml_http_request: boolean;
    job: Optional<string>;
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
    schedule: Optional<string>;
    session: Optional<string>;
    spider: Optional<any>;
    throttler: Optional<any>;
    uri: {
        base_url: string;
        fragment: Optional<string>,
        host: string;
        params: Optional<Rec<string>>;
        port: number,
        query: Optional<string>,
        root_domain: string,
        scheme: string,
    },
    url: string;
    webhook: Optional<string>;
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
    data: Optional<string>; // TODO: type?
    dns: Optional<any>; // TODO: type?
    duration: number;
    error: Optional<string>;  // TODO: type?
    format: string;
    iframes: Array<any>; // TODO: type?
    log_url: string;
    reason: string;
    request_headers: Rec<string>;
    response_headers: Rec<string>;
    screenshots: Rec<{ css_selector: Optional<string>, extension: string, format: string, size: number; url: string }>;
    size: number;
    ssl: Optional<any>; // TODO: type?
    status: string;
    status_code: number;
    success: boolean;
    url: string;
};

export class ScrapeResult {
    config: ConfigData
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