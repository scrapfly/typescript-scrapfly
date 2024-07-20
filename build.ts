import { build, emptyDir } from "@deno/dnt";
import { rollup } from "npm:rollup";
import resolve from "npm:@rollup/plugin-node-resolve";
import commonjs from "npm:@rollup/plugin-commonjs";
import { terser } from "npm:rollup-plugin-terser";

async function bundleForBrowser() {
  console.log("Bundling for browser...");
  const bundle = await rollup({
    input: "npm/esm/main.js",
    plugins: [
      resolve({ browser: true, preferBuiltins: false }),
      commonjs(),
      terser(),
    ],
    logLevel: 'debug',
  });

  console.log("Writing to npm/dist/bundle.js");
  await bundle.write({
    file: "npm/dist/bundle.js",
    format: "esm",
    sourcemap: true,
  });
  console.log("Closing Rollup");
  await bundle.close();
}

await emptyDir("./npm");

const { version, description } = JSON.parse(Deno.readTextFileSync("deno.json"));

await build({
  entryPoints: ["./src/main.ts"],
  outDir: "./npm",
  shims: {
    deno: true,
  },
  // typeCheck: false,  // to disable type checking 
  test: false, // XXX: try running the test but there's 1 unsolvable issue with RequestInfo
  package: {
    name: "scrapfly-sdk",
    version: version,
    description: description,
    license: "BSD",
    type: "module",
    keywords: ["web scraping", "scrapfly", "api", "sdk"],
    repository: {
      type: "git",
      url: "git+https://github.com/scrapfly/typescript-scrapfly.git",
    },
    bugs: {
      url: "https://github.com/scrapfly/typescript-scrapfly/issues",
    },
    homepage: "https://scrapfly.io/",
    main: "./esm/src/main.js", // Point to the ESM output
    types: "./esm/src/main.d.ts", // Point to the TypeScript declarations
  },
  postBuild: async () => {
    Deno.copyFileSync("LICENSE", "npm/LICENSE");
    Deno.copyFileSync("README.md", "npm/README.md");
    await bundleForBrowser();
  },
});

Deno.exit();