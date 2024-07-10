import { gzip } from 'zlib';
import { ExtractionConfigError } from './errors.js';
import { errors } from './main.js';
import { urlsafe_b64encode } from './utils.js';
import { promisify } from 'util';

const gzipPromise = promisify(gzip);

export enum CompressionFormat {
    /**
    Document compression format.

    Attributes:
        GZIP: gzip format.
        ZSTD: zstd format.
        DEFLATE: deflate.
    """
     */
    GZIP = 'gzip',
    ZSTD = 'zstd',
    DEFLATE = 'deflate',
}

export class ExtractionConfig {
    body: string | Buffer;
    content_type: string;
    url?: string = null;
    charset?: string = null;
    template?: string; // saved template name
    epehemeral_template?: object; // epehemeraly declared json template
    extraction_prompt?: string = null;
    extraction_model?: string = null;
    is_document_compressed?: boolean = null;
    document_compression_format?: CompressionFormat = null;
    webhook?: string = null;

    constructor(options: {
        body: string;
        content_type: string;
        url?: string;
        charset?: string;
        template?: string; // saved template name
        epehemeral_template?: object; // epehemeraly declared json template
        extraction_prompt?: string;
        extraction_model?: string;
        is_document_compressed?: boolean;
        document_compression_format?: CompressionFormat;
        webhook?: string;
    }) {
        this.body = options.body;
        this.content_type = options.content_type;
        this.url = options.url;
        this.charset = options.charset;
        this.template = options.template;
        this.epehemeral_template = options.epehemeral_template;
        this.extraction_prompt = options.extraction_prompt;
        this.extraction_model = options.extraction_model;
        this.is_document_compressed = options.is_document_compressed;
        this.document_compression_format = options.document_compression_format;
        this.webhook = options.webhook;
    }

    async toApiParams(options: { key: string }): Promise<Record<string, any>> {
        const params: Record<string, any> = {
            key: options.key,
        };
        // params.body = this.body;
        params.content_type = this.content_type;

        if (this.url) {
            params.url = encodeURI(this.url);
        }

        if (this.charset) {
            params.charset = this.charset;
        }

        if (this.template && this.epehemeral_template) {
            throw new ExtractionConfigError(
                'You cannot pass both parameters template and epehemeral_template. You must choose',
            );
        }

        if (this.template) {
            params.extraction_template = this.template;
        }

        if (this.epehemeral_template) {
            params.extraction_template = 'ephemeral:' + urlsafe_b64encode(JSON.stringify(this.epehemeral_template));
        }

        if (this.extraction_prompt) {
            params.extraction_prompt = this.extraction_prompt;
        }

        if (this.extraction_model) {
            params.extraction_model = this.extraction_model;
        }

        if (this.document_compression_format) {
            if (this.is_document_compressed == null) {
                throw new errors.ExtractionConfigError(
                    'When declaring compression format, your must declare the is_document_compressed parameter to compress the document or skip it.',
                );
            }
            if (this.is_document_compressed == false) {
                if (this.document_compression_format == CompressionFormat.GZIP) {
                    this.body = await gzipPromise(Buffer.from(this.body as string, 'utf-8'));
                } else {
                    throw new errors.ExtractionConfigError(
                        `Auto compression for ${this.document_compression_format} format isn't available. You can manually compress to ${this.document_compression_format} or choose the gzip format for auto compression`,
                    );
                }
            }
        }

        if (this.webhook) {
            params.webhook_name = this.webhook;
        }

        return params;
    }
}
