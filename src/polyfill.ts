export const isDeno = typeof Deno !== 'undefined';
// @ts-ignore: Bun global
export const isBun = typeof Bun !== 'undefined';

export function readFileSync(path: string): Uint8Array {
  if (isDeno) {
    return Deno.readFileSync(path);
  }
  // Node.js / Bun — both support require('fs')
  // deno-lint-ignore no-var
  // @ts-ignore: dynamic require for Node/Bun
  var fs = require('fs');
  return new Uint8Array(fs.readFileSync(path));
}

export async function mkdir(path: string | URL, options: Deno.MkdirOptions): Promise<void> {
  if (isDeno) {
    await Deno.mkdir(path, options);
  } else {
    // @ts-ignore: type for Bun
    await Bun.mkdir(path.toString(), options);
  }
}

export async function writeFile(
  path: string | URL,
  data: Uint8Array,
  options: Deno.WriteFileOptions = {},
): Promise<void> {
  if (isDeno) {
    await Deno.writeFile(path, data, options);
  } else {
    // @ts-ignore: type for Bun
    await Bun.write(path.toString(), data, options);
  }
}
