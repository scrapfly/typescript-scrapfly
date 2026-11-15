import * as assert from 'https://deno.land/std@0.224.0/assert/mod.ts';
import * as sdk from '../src/main.ts';

// Every snippet of the README, the examples and the JSDoc imports the package under one of these names,
// or an example of this repository imports it from its source by a relative path.
const SPECIFIER = String.raw`(?:(?:npm:|jsr:)?(?:@scrapfly\/)?scrapfly-sdk(?:@[\w.^~-]+)?|(?:\.\.?\/)+src\/main\.ts)`;
const IMPORT_NAMED = new RegExp(String.raw`import\s+(type\s+)?(?:([A-Za-z_$][\w$]*)\s*,\s*)?\{([^}]*)\}\s*from\s*['"]${SPECIFIER}['"]`, 'g');
const IMPORT_DEFAULT = new RegExp(String.raw`import\s+([A-Za-z_$][\w$]*)\s+from\s*['"]${SPECIFIER}['"]`, 'g');
const IMPORT_NAMESPACE = new RegExp(String.raw`import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s*['"]${SPECIFIER}['"]`, 'g');
const REQUIRE_NAMED = new RegExp(String.raw`(?:const|let|var)\s+\{([^}]*)\}\s*=\s*require\(\s*['"]${SPECIFIER}['"]\s*\)`, 'g');
const REQUIRE_WHOLE = new RegExp(String.raw`(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\(\s*['"]${SPECIFIER}['"]\s*\)`, 'g');

const ROOT = new URL('../', import.meta.url);
const runtime = sdk as Record<string, unknown>;

interface Binding {
  file: string;
  local: string;
  // null: the whole module, as `import * as x` or `const x = require(...)` gives it.
  exported: string | null;
  typeOnly: boolean;
}

async function walk(dir: URL, keep: (name: string) => boolean): Promise<URL[]> {
  const found: URL[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
      continue;
    }
    const url = new URL(entry.name + (entry.isDirectory ? '/' : ''), dir);
    if (entry.isDirectory) {
      found.push(...(await walk(url, keep)));
    } else if (keep(entry.name)) {
      found.push(url);
    }
  }
  return found;
}

function relative(url: URL): string {
  return url.pathname.slice(ROOT.pathname.length);
}

// The text a reader copies: a whole markdown or example file; of a source file, its doc comments without their
// ` * ` line prefixes, so a multi-line import reads as it does in a file.
async function snippetText(url: URL): Promise<string> {
  const text = await Deno.readTextFile(url);
  if (!relative(url).startsWith('src/')) {
    return text;
  }
  const comments = text.match(/\/\*\*[\s\S]*?\*\//g) ?? [];
  return comments.map((c) => c.slice(3, -2).replace(/^[ \t]*\*(?: |$)/gm, '')).join('\n');
}

function typeExports(mainSource: string): Set<string> {
  const names = new Set<string>();
  for (const block of mainSource.matchAll(/export\s+type\s+\{([^}]*)\}/g)) {
    for (const part of block[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop();
      if (name) {
        names.add(name);
      }
    }
  }
  return names;
}

function namedBindings(file: string, list: string, typeOnly: boolean, separator: RegExp): Binding[] {
  const bindings: Binding[] = [];
  for (const raw of list.split(',')) {
    const part = raw.trim();
    if (!part) {
      continue;
    }
    const isType = typeOnly || part.startsWith('type ');
    const [exported, local] = part.replace(/^type\s+/, '').split(separator).map((s) => s.trim());
    bindings.push({ file, local: local ?? exported, exported, typeOnly: isType });
  }
  return bindings;
}

function bindingsOf(file: string, text: string): Binding[] {
  const bindings: Binding[] = [];
  for (const m of text.matchAll(IMPORT_NAMED)) {
    if (m[2]) {
      bindings.push({ file, local: m[2], exported: 'default', typeOnly: false });
    }
    bindings.push(...namedBindings(file, m[3], Boolean(m[1]), /\s+as\s+/));
  }
  for (const m of text.matchAll(IMPORT_DEFAULT)) {
    bindings.push({ file, local: m[1], exported: 'default', typeOnly: false });
  }
  for (const m of text.matchAll(IMPORT_NAMESPACE)) {
    bindings.push({ file, local: m[1], exported: null, typeOnly: false });
  }
  for (const m of text.matchAll(REQUIRE_NAMED)) {
    bindings.push(...namedBindings(file, m[1], false, /\s*:\s*/));
  }
  for (const m of text.matchAll(REQUIRE_WHOLE)) {
    bindings.push({ file, local: m[1], exported: null, typeOnly: false });
  }
  return bindings;
}

async function snippetFiles(): Promise<URL[]> {
  const docs = await walk(new URL('examples/', ROOT), (n) => /\.(md|mjs|cjs|js|ts)$/.test(n));
  const sources = await walk(new URL('src/', ROOT), (n) => n.endsWith('.ts'));
  return [new URL('README.md', ROOT), ...docs, ...sources];
}

Deno.test('docs: every name a snippet imports from the package is exported by src/main.ts', async () => {
  const types = typeExports(await Deno.readTextFile(new URL('src/main.ts', ROOT)));
  const missing: string[] = [];
  let checked = 0;
  for (const url of await snippetFiles()) {
    const file = relative(url);
    for (const binding of bindingsOf(file, await snippetText(url))) {
      if (binding.exported === null) {
        continue;
      }
      checked++;
      if (!(binding.exported in runtime) && !types.has(binding.exported)) {
        missing.push(`${file}: ${binding.exported}`);
      }
    }
  }
  assert.assertEquals(missing, [], 'snippets import names the package does not export');
  assert.assert(checked > 20, `only ${checked} imports found: the patterns no longer match the snippets`);
});

Deno.test('docs: every member a snippet reads on an imported value exists on it', async () => {
  const missing: string[] = [];
  let checked = 0;
  for (const url of await snippetFiles()) {
    const file = relative(url);
    const text = await snippetText(url);
    for (const binding of bindingsOf(file, text)) {
      if (binding.typeOnly) {
        continue;
      }
      const value = binding.exported === null ? runtime : runtime[binding.exported];
      if (value === undefined || value === null) {
        continue;
      }
      const access = new RegExp(String.raw`(?<![\w$.])${binding.local.replace(/\$/g, '\\$')}\.([A-Za-z_$][\w$]*)`, 'g');
      for (const m of text.matchAll(access)) {
        checked++;
        if (!(m[1] in (value as object))) {
          missing.push(`${file}: ${binding.local}.${m[1]}`);
        }
      }
    }
  }
  assert.assertEquals([...new Set(missing)], [], 'snippets read members the package does not have');
  assert.assert(checked > 5, `only ${checked} member reads found: the patterns no longer match the snippets`);
});
