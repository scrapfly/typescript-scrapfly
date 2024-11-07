import * as errors from './errors.ts';
import { urlsafe_b64encode } from './utils.ts';
import { ExtractionConfigError } from './errors.ts';

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
  extraction_template?: string; // saved template name
  extraction_ephemeral_template?: object; // ephemeraly declared json template
  extraction_prompt?: string;
  extraction_model?: string;
  is_document_compressed?: boolean;
  document_compression_format?: 'gzip' | 'zstd' | 'deflate' | CompressionFormat;
  webhook?: string;
};

export class ExtractionConfig {
  body: string | Uint8Array;
  content_type: string;
  url?: string;
  charset?: string;
  extraction_template?: string; // saved template name
  extraction_ephemeral_template?: object; // ephemeraly declared json template
  extraction_prompt?: string;
  extraction_model?: string;
  is_document_compressed?: boolean;
  document_compression_format?: 'gzip' | 'zstd' | 'deflate' | CompressionFormat;
  webhook?: string;

  constructor(options: ExtractionConfigOptions) {
    this.validateOptions(options);
    if (
      options.document_compression_format &&
      !Object.values(CompressionFormat).includes(options.document_compression_format as CompressionFormat)
    ) {
      throw new errors.ExtractionConfigError(
        `Invalid CompressionFormat param value: ${options.document_compression_format}`,
      );
    }
    this.body = options.body;
    this.content_type = options.content_type;
    this.url = options.url ?? this.url;
    this.charset = options.charset ?? this.charset;
    this.extraction_template = options.extraction_template ?? this.extraction_template;
    this.extraction_ephemeral_template = options.extraction_ephemeral_template ?? this.extraction_ephemeral_template;
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

    if (this.extraction_template && this.extraction_ephemeral_template) {
      throw new ExtractionConfigError(
        'You cannot pass both parameters extraction_template and extraction_ephemeral_template. You must choose',
      );
    }

    if (this.extraction_template) {
      params.extraction_template = this.extraction_template;
    }

    if (this.extraction_ephemeral_template) {
      params.extraction_template = 'ephemeral:' + urlsafe_b64encode(JSON.stringify(this.extraction_ephemeral_template));
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
            `You can manually compress to ${this.document_compression_format}.`,
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
