# Scrapfly SDK with Cloudflare Workers or AWS Lambda or Supabase

There are many serverless platforms that can run Javascript or Typescript code which fit well wtih Scrapfly.io. This directory contains examples for Cloudflare Workers, AWS Lambda and Supabase.

The easiest way is to use [Denoflare](https://denoflare.dev/) which allows to easily develop, test and deploy Typescript workers to Cloudflare Workers, AWS Lambda or Supabase.

To start, install denoflare:

```bash
deno install --unstable-worker-options --allow-read --allow-net --allow-env --allow-run --name denoflare --force https://github.com/skymethod/denoflare/blob/master/cli/cli.ts
```

Then see `index.ts` for your worker code and configure the `key` with your Scrapfly API key. 

To test your worker locally use the `serve` command:

```bash
denoflare serve example --bundle backend=esbuild
```

Finally, to push your worker use one of the `push-` commands:

```bash
# for cloudflare
denoflare push-deploy --bundle backend=esbuild
# for aws lambda
denoflare push-lambda --bundle backend=esbuild
# for supabase
denoflare push-supabase --bundle backend=esbuild
```

for more see https://denoflare.dev/