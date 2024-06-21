import { urlsafe_b64encode } from '../src/utils.js';
import { describe, it, expect } from '@jest/globals';

describe('urlsafe_b64encode', () => {
    it('should encode a string to base64', () => {
        expect(urlsafe_b64encode('hello+foo/bar=====')).toBe('aGVsbG8rZm9vL2Jhcj09PT09');
    });
    it('multiple + characters should be encoded correctly -', () => {
        let inp ='const is_greater_than_1 = 45 >= 5 ? true : false\nconst is_greater_than_2 = 6435 >= 5 ? true : false';
        let expected = 'Y29uc3QgaXNfZ3JlYXRlcl90aGFuXzEgPSA0NSA-PSA1ID8gdHJ1ZSA6IGZhbHNlCmNvbnN0IGlzX2dyZWF0ZXJfdGhhbl8yID0gNjQzNSA-PSA1ID8gdHJ1ZSA6IGZhbHNl'
        expect(urlsafe_b64encode(inp)).toBe(expected);
    });
    it('multiple / characters should be encoded correctly as _', () => {
        let inp ='const has_env1 = window.env1 ? true : false;\nconst has_env2 = window.env2 ? true : false;';
        let expected = 'Y29uc3QgaGFzX2VudjEgPSB3aW5kb3cuZW52MSA_IHRydWUgOiBmYWxzZTsKY29uc3QgaGFzX2VudjIgPSB3aW5kb3cuZW52MiA_IHRydWUgOiBmYWxzZTs'
        expect(urlsafe_b64encode(inp)).toBe(expected);
    });
});
