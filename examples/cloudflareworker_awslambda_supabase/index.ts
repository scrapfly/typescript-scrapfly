import { ScrapflyClient, ScrapeConfig, ScreenshotConfig, ExtractionConfig } from 'jsr:@scrapfly/scrapfly-sdk';

const key = 'YOUR SCRAPFLY KEY';
const client = new ScrapflyClient({ key });

export default {
    async fetch(request: Request, env: any) {
        try {
            const result = await client.scrape(
                new ScrapeConfig({
                    url: 'https://web-scraping.dev/product/1',
                }),
            );
            const data = {
                "url": "https://web-scraping.dev/product/1",
                "price": result.selector(".product-price").text(),
                "title": result.selector(".product-title").text(),
                "description": result.selector(".product-description").text(),
            };
            return new Response(JSON.stringify(data), {
                headers: {
                    "content-type": "application/json",
                }
            })
        } catch (e) {
            return new Response(JSON.stringify({"error": e.message}), {
                headers: {
                    "content-type": "application/json",
                }
            })
        }
    },
}
