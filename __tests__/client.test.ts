import axios from 'axios';
import { ScrapflyClient } from "../src/client.js";
import { BadApiKeyError } from '../src/errors.js';
import { ScrapeConfig } from "../src/scrapeconfig.js";

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('client async scrape', () => {
    const KEY = "1234";
    const client = new ScrapflyClient({ "key": KEY });

    it('GET success', async () => {
        const url = "https://httpbin.dev/json";

        mockedAxios.request.mockImplementation(async config => {
            // Ensure the URL matches the pattern
            expect(config.url).toMatch(client.HOST + "/scrape");
            expect(config.method).toEqual("GET");
            expect(config.params.key).toMatch(KEY);
            expect(config.params.url).toMatch(url);
            expect(Object.keys(config.params)).toEqual(['key', 'url'])

            // Return the fake response
            return {
                status: 200,
                data: {
                    result: { "content": "some html" },
                    config: { "url": url },
                    context: { "asp": false },
                    uuid: '1234',
                },
            };
        });


        const result = await client.asyncScrape(new ScrapeConfig({ "url": url }));
        expect(result).toBeDefined();
        expect(result.result.content).toBe('some html');
        expect(result.config.url).toBe("https://httpbin.dev/json");
        expect(result.context.asp).toBe(false);
        expect(result.uuid).toBe('1234');
        // a single request:
        expect(mockedAxios.request).toHaveBeenCalledTimes(1);
    });
    it('POST success', async () => {
        const url = "https://httpbin.dev/json";
        mockedAxios.request.mockImplementation(async config => {
            // Ensure the URL matches the pattern
            expect(config.url).toMatch(client.HOST + "/scrape");
            expect(config.method).toEqual("POST");
            expect(config.params.key).toMatch(KEY);
            expect(config.params.url).toMatch(url);
            expect(config.params['headers[content-type]']).toMatch('application/x-www-form-urlencoded');
            expect(Object.keys(config.params)).toEqual(['key', 'url', 'headers[content-type]'])

            // Return the fake response
            return {
                status: 200,
                data: {
                    result: { "content": "some html" },
                    config: { "url": url },
                    context: { "asp": false },
                    uuid: '1234',
                },
            };
        });

        const result = await client.asyncScrape(new ScrapeConfig({ "url": "https://httpbin.dev/json", "method": "POST", "data": { "foo": "bar" } }));
        expect(result).toBeDefined();
        expect(result.result.content).toBe('some html');
        expect(result.config.url).toBe("https://httpbin.dev/json");
        expect(result.context.asp).toBe(false);
        expect(result.uuid).toBe('1234');
    });
    
});

describe('client init', () => {
    it("success", async () => {
        const client = new ScrapflyClient({ "key": "1234" });
        expect(client).toBeDefined();
    })

    it("invalid key", async () => {
        expect(() => {
            new ScrapflyClient({ "key": null });
        }).toThrow(BadApiKeyError)
    })


})
