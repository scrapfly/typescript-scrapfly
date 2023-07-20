import { ScrapeConfig } from "../src/scrapeconfig.js";
import { HttpMethod } from "../src/types.js";
import { ScrapeConfigError } from "../src/errors.js";

describe("scrapeconfig", () => {

  it("loads", () => {
    const config = new ScrapeConfig({ "url": "http://httpbin.dev/get" });
    expect(config.url).toBe("http://httpbin.dev/get");
  });

  it("allowed methods", () => {
    (["GET", "POST", "PUT", "PATCH", "HEAD"] as HttpMethod[]).forEach((method) => {
      const config = new ScrapeConfig({ "url": "http://httpbin.dev/get", "method": method });
      expect(config.method).toBe(method);
    })
  });

  it("defaults", () => {
    const config = new ScrapeConfig({ "url": "http://httpbin.dev/get" });
    expect(config.method).toBe("GET");
    expect(config.render_js).toBe(false);
  });

  it("POST/PUT/PATCH data->body conversion defaults to form", async () => {
    const config = new ScrapeConfig({ "url": "http://httpbin.dev/get", "method": "POST", "data": { foo: "123", bar: 456 } });
    expect(config.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(config.body).toBe("foo=123&bar=456");
  })

  it("POST/PUT/PATCH data->body conversion as json", async () => {
    const config = new ScrapeConfig({ "url": "http://httpbin.dev/get", "method": "POST", "data": { foo: "123", bar: 456 }, "headers": { "content-type": "application/json" } });
    expect(config.headers["content-type"]).toBe("application/json");
    expect(config.body).toBe("{\"foo\":\"123\",\"bar\":456}");
  })
});

describe('config invalid', () => {
  it("data and body set together", async () => {
    expect(() => {
      new ScrapeConfig({ "url": "http://httpbin.dev/get", "method": "POST", "data": { foo: "123" }, "body": '{"foo": "123"}' });
    }).toThrow(ScrapeConfigError);
  });
})



describe("url param generation", () => {
  it("basic config", () => {
    const config = new ScrapeConfig({ "url": "http://httpbin.dev/get" });
    const params = config.toApiParams({ "key": "1234" });
    expect(params).toEqual({
      "key": "1234",
      "url": "http://httpbin.dev/get",
    });
  });

  it("country keeps formatting as is", () => {
    const countries = ["us", "us,ca,mx", "us:1,ca:5,mx:3,-gb"];
    countries.forEach((country) => {
      const config = new ScrapeConfig({ "url": "http://httpbin.dev/get", "country": country });
      expect(config.toApiParams({ "key": "1234" }).country).toBe(country);
    });
  });

  it("headers formatted as headers[key]=value", () => {
    const config = new ScrapeConfig({ "url": "http://httpbin.dev/get", "headers": { "x-test": "test", "Content-Type": "mock" } });
    expect(config.toApiParams({ "key": "1234" })).toEqual({
      "key": "1234",
      "url": "http://httpbin.dev/get",
      "headers[x-test]": "test",
      "headers[content-type]": "mock",
    });
  });

  it("headers override duplicates", () => {
    const config = new ScrapeConfig({ "url": "http://httpbin.dev/get", "headers": { "x-test": "test", "X-Test": "mock" } });
    expect(config.toApiParams({ "key": "1234" })).toEqual({
      "key": "1234",
      "url": "http://httpbin.dev/get",
      "headers[x-test]": "mock",
    });
  });

  it("headers are not case sensitive", () => {
    const config = new ScrapeConfig({ "url": "http://httpbin.dev/get", "headers": { "x-test": "test", "X-Test": "mock" } });
    expect(config.toApiParams({ "key": "1234" })).toEqual({
      "key": "1234",
      "url": "http://httpbin.dev/get",
      "headers[x-test]": "mock",
    });
  });

  it("cookies added to Cookie header", () => {
    const config = new ScrapeConfig({ "url": "http://httpbin.dev/get", "cookies": { "x-test": "test", "X-Test": "mock" } });
    expect(config.toApiParams({ "key": "1234" })).toEqual({
      "key": "1234",
      "url": "http://httpbin.dev/get",
      "headers[cookie]": "x-test=mock",
    });
  });

  it("cookies extend Cookie header", () => {
    const config = new ScrapeConfig({ "url": "http://httpbin.dev/get", "cookies": { "x-test": "test", "X-Test": "mock" }, "headers": { "cookie": "foo=bar" } });
    expect(config.toApiParams({ "key": "1234" })).toEqual({
      "key": "1234",
      "url": "http://httpbin.dev/get",
      "headers[cookie]": "foo=bar; x-test=mock",
    });
  });

  it("js scenario encodes", () => {
    const scenario = [
      { "wait_for_selector": { "selector": ".review" } },
      { "click": { "selector": "#load-more-reviews" } },
      { "wait_for_navigation": {} },
      { "execute": { "script": "[...document.querySelectorAll('.review p')].map(p=>p.outerText)" } }
    ];
    const config = new ScrapeConfig({ url: "https://web-scraping.dev/product/1", js_scenario: scenario, render_js: true });
    expect(config.toApiParams({ "key": "1234" })).toEqual({
      url: "https://web-scraping.dev/product/1",
      key: "1234",
      render_js: true,
      js_scenario: "W3sid2FpdF9mb3Jfc2VsZWN0b3IiOnsic2VsZWN0b3IiOiIucmV2aWV3In19LHsiY2xpY2siOnsic2VsZWN0b3IiOiIjbG9hZC1tb3JlLXJldmlld3MifX0seyJ3YWl0X2Zvcl9uYXZpZ2F0aW9uIjp7fX0seyJleGVjdXRlIjp7InNjcmlwdCI6IlsuLi5kb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcucmV2aWV3IHAnKV0ubWFwKHA9PnAub3V0ZXJUZXh0KSJ9fV0",
    });

  })


})

