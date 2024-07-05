# Scrapfly Typescript SDK Examples

This directory contains commonly used examples for the Scrapfly Typescript SDK which is available in Typescript runtimes (bun, deno) as well as javascript ones like Nodejs.

You can use `node` to run the `.js` examples:

```
node examples/basic-get.js
```

Or compile `.ts` examples to `.js`:

```
tsc examples/scrape/basic-get.ts -o examples/basic-get.js
node examples/scrape/basic-get.js
```

Or run typescript directly through runtimes like `.ts`:

```
bun examples/scrape/basic-get.ts
```
