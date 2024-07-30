# Scrapfly SDK with ESM (NodeJS)

ESM (ECMAScript Modules) is a new module system that allows you to import modules using `import` and `export` statements available in all Javascript flavors including NodeJS.

The examples in `esm_examples.mjs` demonstrate how to use Scrapfly SDK with CommonJS. To start, init a project and install the SDK using npm:

```bash
$ npm init -y
$ npm install scrapfly-sdk
```

Then see `esm_examples.mjs` for examples and each example can be run by specifying the example function name:

```bash
$ node esm_examples.mjs <example_name> <scrapfly_api_key>
# for example
$ node esm_examples.mjs basicGet scp-test-123
```
