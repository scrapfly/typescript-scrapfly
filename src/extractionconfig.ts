import { ExtractionConfigError } from './errors.js';
import { urlsafe_b64encode } from './utils.js';

export class ExtractionConfig {
    body: string;
    content_type: string;
    url?: string = null;
    charset?: string = null;
    template?: string; // saved template name
    epehemeral_template?: object; // epehemeraly declared json template
    extraction_prompt?: string = null;
    extraction_model?: string = null;

    constructor(options: {
        body: string;
        content_type: string;
        url?: string;
        charset?: string;
        template?: string; // saved template name
        epehemeral_template?: object; // epehemeraly declared json template
        extraction_prompt?: string;
        extraction_model?: string;
    }) {
        this.body = options.body;
        this.content_type = options.content_type;
        this.url = options.url;
        this.charset = options.charset;
        this.template = options.template;
        this.epehemeral_template = options.epehemeral_template;
        this.extraction_prompt = options.extraction_prompt;
        this.extraction_model = options.extraction_model;
    }

    toApiParams(options: { key: string }): Record<string, any> {
        const params: Record<string, any> = {
            key: options.key,
        };
        params.body = this.body;
        params.content_type = this.content_type;

        if (this.url) {
            params.url = encodeURI(this.url);
        }

        if (this.charset) {
            params.charset = this.charset;
        }

        if (this.template && this.epehemeral_template) {
            throw new ExtractionConfigError('You cannot pass both parameters template and epehemeral_template. You must choose')
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
        return params;
    }
}
