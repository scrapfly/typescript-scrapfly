import { urlsafe_b64encode } from "../src/utils"

describe('urlsafe_b64encode', () => {
    it('should encode a string to base64', () => {
        expect(urlsafe_b64encode('hello+foo/bar=====')).toBe('aGVsbG8rZm9vL2Jhcj09PT09');
    });
});