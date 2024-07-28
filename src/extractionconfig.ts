import * as errors from './errors.ts';
import { urlsafe_b64encode } from './utils.ts';

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

type ExtractionConfigOptions = {
  body: string;
  content_type: string;
  url?: string;
  charset?: string;
  template?: string; // saved template name
  ephemeral_template?: object; // ephemeraly declared json template
  extraction_prompt?: string;
  extraction_model?: string;
  is_document_compressed?: boolean;
  document_compression_format?: CompressionFormat;
  webhook?: string;
};

export class ExtractionConfig {
  body: string | Uint8Array;
  content_type: string;
  url?: string;
  charset?: string;
  template?: string; // saved template name
  ephemeral_template?: object; // ephemeraly declared json template
  extraction_prompt?: string;
  extraction_model?: string;
  is_document_compressed?: boolean;
  document_compression_format?: CompressionFormat;
  webhook?: string;

  constructor(options: ExtractionConfigOptions) {
    this.validateOptions(options);
    this.body = options.body;
    this.content_type = options.content_type;
    this.url = options.url ?? this.url;
    this.charset = options.charset ?? this.charset;
    this.template = options.template ?? this.template;
    this.ephemeral_template = options.ephemeral_template ?? this.ephemeral_template;
    this.extraction_prompt = options.extraction_prompt ?? this.extraction_prompt;
    this.extraction_model = options.extraction_model ?? this.extraction_model;
    this.is_document_compressed = options.is_document_compressed ?? this.is_document_compressed;
    this.document_compression_format = options.document_compression_format ?? this.document_compression_format;
    this.webhook = options.webhook ?? this.webhook;
  }

  private validateOptions(options: Partial<ExtractionConfigOptions>) {
    const validKeys = new Set(Object.keys(this) as Array<keyof ExtractionConfig>);
    for (const key in options) {
      if (!validKeys.has(key as keyof ExtractionConfig)) {
        throw new errors.ExtractionConfigError(`Invalid option provided: ${key}`);
      }
    }
  }

  toApiParams(options: { key: string }): Record<string, any> {
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

    if (this.template && this.ephemeral_template) {
      throw new errors.ExtractionConfigError(
        'You cannot pass both parameters template and ephemeral_template. You must choose',
      );
    }

    if (this.template) {
      params.extraction_template = this.template;
    }

    if (this.ephemeral_template) {
      params.extraction_template = 'ephemeral:' + urlsafe_b64encode(JSON.stringify(this.ephemeral_template));
    }

    if (this.extraction_prompt) {
      params.extraction_prompt = this.extraction_prompt;
    }

    if (this.extraction_model) {
      params.extraction_model = this.extraction_model;
    }

    if (this.document_compression_format) {
      if (this.is_document_compressed === undefined) {
        throw new errors.ExtractionConfigError(
          `When declaring compression format, your must declare the ` +
            `is_document_compressed parameter to compress the document or skip it.`,
        );
      }
      if (this.is_document_compressed === false) {
        // if (this.document_compression_format === CompressionFormat.GZIP) {
        // XXX: This breaks cloudflare workers for some reason
        // const compressed = gzip(new TextEncoder().encode(this.body as string));
        // this.body = new Uint8Array(compressed);
        // throw new Error("automatic gzip is not supported yet, pass gzipped ");
        // } else {
        throw new errors.ExtractionConfigError(
          `Auto compression for ${this.document_compression_format} format isn't available. ` +
            `You can manually compress to ${this.document_compression_format}` +
            `or choose the gzip format for auto compression`,
        );
        // }
      }
    }

    if (this.webhook) {
      params.webhook_name = this.webhook;
    }

    return params;
  }
}
