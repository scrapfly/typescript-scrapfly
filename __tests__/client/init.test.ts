import * as errors from '../../src/errors.js';
import { ScrapflyClient } from '../../src/client.js';

import { describe, it, expect } from '@jest/globals';

describe('client init', () => {
    it('success', async () => {
        const client = new ScrapflyClient({ key: '1234' });
        expect(client).toBeDefined();
    });

    it('invalid key', async () => {
        expect(() => {
            new ScrapflyClient({ key: null });
        }).toThrow(errors.BadApiKeyError);
    });
});
