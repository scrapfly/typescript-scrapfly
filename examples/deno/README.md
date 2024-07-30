# Scrapfly SDK with Deno

Deno is a modern and secure runtime for JavaScript and TypeScript that uses V8 and is built in Rust.


These examples demonstrate Typescript SDK usage with Deno and for that install the SDK using jsr.io which distributes Typescript files:

```bash
deno add jsr:@scrapfly/scrapfly-sdk
```

Then see `deno_examples.ts` for examples and each example can be run by specifying the example function name:

```bash
$ deno run --allow-net -A deno_examples.ts <example_name> <scrapfly_api_key>
# for example
$ deno run --allow-net -A deno_examples.ts basicGet scp-test-123
```

