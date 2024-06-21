import { urlsafe_b64encode } from '../src/utils.js';
import { describe, it, expect } from '@jest/globals';

describe('urlsafe_b64encode', () => {
    it('should encode a string to base64', () => {
        expect(urlsafe_b64encode('hello+foo/bar=====')).toBe('aGVsbG8rZm9vL2Jhcj09PT09');
    });
    it('multiple characters should be encoded correctly', () => {
        // XXX: investigate how to produce a string that contains + or / when b64 encoded.
    });
});
