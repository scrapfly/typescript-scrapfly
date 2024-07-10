export function mockedStream() {
    const mockStream = {
        locked: false,
        state: 'readable',
        supportsBYOB: false,
        getReader() {
            return {
                read() {
                    return Promise.resolve({ done: true, value: null });
                },
                cancel() {
                    return Promise.resolve();
                },
            };
        },
    };
    return mockStream;
}

export function resultFactory(params: {
    url?: string;
    status?: string;
    status_code?: number;
    response_status_code?: number;
    success?: boolean;
    error?: string;
}): Record<string, any> {
    return {
        status: params.response_status_code ?? 200,
        data: {
            result: {
                content: 'some html',
                status: params.status ?? 'DONE',
                success: params.success ?? true,
                status_code: params.status_code ?? 200,
                error: params.error ?? '',
                log_url: '123',
            },
            config: { url: params.url ?? 'https://httpbin.dev/json' },
            context: { asp: false },
            uuid: '1234',
        },
    };
}

export function responseFactory(body: any, init?: ResponseInit): Response {
    const text = JSON.stringify(body);
    const response = new Response(text, init);
    (response as any).json = async () => JSON.parse(text);
    return response;
}