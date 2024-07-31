export const isDeno = typeof Deno !== 'undefined';

export async function mkdir(path: string | URL, options: Deno.MkdirOptions): Promise<void> {
  if (isDeno) {
    await Deno.mkdir(path, options);
  } else {
    // Dynamic import of 'fs' for Node.js/Bun
    const fs = await import('fs').then((mod) => mod.promises);
    const { recursive } = options;
    await fs.mkdir(path.toString(), { recursive: !!recursive });
    console.log('Directory created successfully!');
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
    // Dynamic import of 'fs' for Node.js/Bun
    const fs = await import('fs').then((mod) => mod.promises);
    await fs.writeFile(path.toString(), data, {
      encoding: 'utf-8',
      flag: options.append ? 'a' : 'w',
    });
  }
}
