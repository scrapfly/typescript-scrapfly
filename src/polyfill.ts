export const isDeno = typeof Deno !== 'undefined';

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
