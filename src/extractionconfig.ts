import * as errors from './errors.ts';
import { urlsafe_b64encode } from './utils.ts';
import { ExtractionConfigError } from './errors.ts';

/** Compression format declared for documents submitted to the Extraction API. */
export enum CompressionFormat {
  /** gzip compression. */
  GZIP = 'gzip',
  /** zstd compression. */
  ZSTD = 'zstd',
  /** DEFLATE compression. */
  DEFLATE = 'deflate',
}

/**
 * User-facing options accepted by {@link ExtractionConfig}. See the
 * [Extraction API reference](https://scrapfly.io/docs/extraction-api)
 * for the authoritative list of valid values.
 */
type ExtractionConfigOptions = {
  /** Document body to extract from. */
  body: string;
  /** Content-Type of the body (e.g. "text/html"). */
  content_type: string;
  /** URL associated with the document (used for link resolution). */
  url?: string;
  /** Character set of the document. */
  charset?: string;
  /** Name of a saved extraction template. */
  extraction_template?: string;
  /** Inline extraction template, used instead of a saved one. */
  extraction_ephemeral_template?: object;
  /** Natural-language prompt for LLM-based extraction. */
  extraction_prompt?: string;
  /** Override the LLM model used for prompt-based extraction. */
  extraction_model?: string;
  /** Whether the provided body is already compressed. */
  is_document_compressed?: boolean;
  /** Compression format of the body. See {@link CompressionFormat}. */
  document_compression_format?: 'gzip' | 'zstd' | 'deflate' | CompressionFormat;
  /** Webhook name to notify when extraction completes. */
  webhook?: string;
  /** Request timeout in milliseconds. */
  timeout?: number;

  /** @deprecated Use {@link extraction_template} instead. */
  template?: string;
  /** @deprecated Use {@link extraction_ephemeral_template} instead. */
  ephemeral_template?: object;
};

/**
 * Configuration for an Extraction API call. Holds the document to
 * extract from and the template/prompt/model that should drive the
 * extraction.
 */
export class ExtractionConfig {
  /** Document body. */
  body: string | Uint8Array;
  /** Content-Type of the body. */
  content_type: string;
  /** URL associated with the document. */
  url?: string;
  /** Character set of the document. */
  charset?: string;
  /** Saved extraction template name. */
  extraction_template?: string;
  /** Inline extraction template. */
  extraction_ephemeral_template?: object;
  /** Natural-language extraction prompt. */
  extraction_prompt?: string;
  /** LLM model override for prompt-based extraction. */
  extraction_model?: string;
  /** Whether the body is pre-compressed. */
  is_document_compressed?: boolean;
  /** Compression format of the body. */
  document_compression_format?: 'gzip' | 'zstd' | 'deflate' | CompressionFormat;
  /** Webhook name to notify on completion. */
  webhook?: string;
  /** Request timeout in milliseconds. */
  timeout?: number;

  /** @deprecated Use {@link extraction_template} instead. */
  template?: string;
  /** @deprecated Use {@link extraction_ephemeral_template} instead. */
  ephemeral_template?: object;

  /**
   * @param options See {@link ExtractionConfigOptions}.
   * @throws {@link errors.ExtractionConfigError} if an unknown option is supplied.
   */
  constructor(options: ExtractionConfigOptions) {
    this.validateOptions(options);
    if (options.template) {
      console.warn(
        `Deprecation warning: 'template' is deprecated. Use 'extraction_template' instead.`
      );
      this.extraction_template = options.template;
    } else {
      this.extraction_template = options.extraction_template;
    }
    if (options.ephemeral_template) {
      console.warn(
        `Deprecation warning: 'ephemeral_template' is deprecated. Use 'extraction_ephemeral_template' instead.`
      );
      this.extraction_ephemeral_template = options.ephemeral_template;
    } else {
      this.extraction_ephemeral_template = options.extraction_ephemeral_template;
    }

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
    this.timeout = options.timeout ?? this.timeout;
  }

  private validateOptions(options: Partial<ExtractionConfigOptions>) {
    const validKeys = new Set(Object.keys(this) as Array<keyof ExtractionConfig>);
    for (const key in options) {
      if (!validKeys.has(key as keyof ExtractionConfig)) {
        throw new errors.ExtractionConfigError(`Invalid option provided: ${key}`);
      }
    }
  }

  /**
   * Encode this config as the query-string parameters sent to the
   * Extraction API.
   *
   * @param options.key Scrapfly API key.
   * @returns A record suitable for `URLSearchParams` construction.
   * @throws {@link ExtractionConfigError} on conflicting or incompatible options.
   */
  toApiParams(options: { key: string }): Record<string, any> {
    const params: Record<string, any> = {
      key: options.key,
    };
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
    if (this.timeout) {
      params.timeout = this.timeout;
    }

    return params;
  }
}
