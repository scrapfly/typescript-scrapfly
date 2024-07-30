# Scrapfly SDK with Bun

Bun is a modern javascript runtime that can execute both javascript and typescript without transpilation.

These examples demonstrate Typescript SDK usage with Bun and for that install the SDK using jsr.io which distributes Typescript files:

```
$ bunx jsr add @scrapfly/scrapfly-sdk
```

Then see `bun_examples.ts` for examples and each example can be run by specifying the example function name:

```bash
$ bun run bun_examples.ts <example_name> <scrapfly_api_key>
# for example
$ bun run bun_examples.ts basicGet scp-test-123
```
