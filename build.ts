import { build, emptyDir } from "@deno/dnt";
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
    main: "./esm/main.js", 
    types: "./esm/main.d.ts",
  },
  postBuild: async () => {
    Deno.copyFileSync("LICENSE", "npm/LICENSE");
    Deno.copyFileSync("README.md", "npm/README.md");
  },
});

Deno.exit();