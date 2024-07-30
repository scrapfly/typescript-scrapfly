# Scrapfly SDK with CommonJS (NodeJS)

CommonJS is a NodeJS module system that allows you to import modules using `require` function.

The examples in `commonjs_examples.cjs` demonstrate how to use Scrapfly SDK with CommonJS. To start, init a project and install the SDK using npm:

```bash
$ npm init -y
$ npm install scrapfly-sdk
```

Then see `commonjs_examples.cjs` for examples and each example can be run by specifying the example function name:

```bash
$ node commonjs_examples.cjs <example_name> <scrapfly_api_key>
# for example
$ node commonjs_examples.cjs basicGet scp-test-123
```
