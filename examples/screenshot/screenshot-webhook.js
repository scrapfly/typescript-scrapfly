/*
This example shows how to use the webhook feature with Scrapfly's screenshot API
*/
import { ScrapflyClient, ScreenshotConfig } from 'scrapfly-sdk';

const key = 'YOUR SCRAPFLY KEY';
const client = new ScrapflyClient({ key });

const screenshotResult = await client.screenshot(
    new ScreenshotConfig({
        url: 'https://web-scraping.dev/products',
        webhook: 'my-webhook'
    }),
);

// raw result
console.log(screenshotResult.result)
`
{
    job_uuid: 'a0e6f3e8-be35-438a-942a-be77aa545d30',
    success: true,
    webhook_name: 'my-webhook',
    webhook_queue_limit: 10000,
    webhook_queued_element: 7,
    webhook_uuid: 'cdf37252-fea7-4267-a568-aa0e5964ee21'
}
`
