import { readFile } from 'node:fs/promises';
import esbuild from 'esbuild';

/**
 * Bundles the API into a single ESM file so production runs plain Node, with no
 * TypeScript toolchain at runtime.
 *
 * `@billio/shared` is a source-only workspace package — it is never published and
 * has no build of its own — so it must be bundled in. Everything else this
 * package depends on stays external and is installed from the lockfile, which
 * keeps native and CJS-heavy dependencies (express) loading exactly as they
 * normally would. Reading the externals from package.json means a new dependency
 * cannot silently fall out of sync with this script.
 */
const pkg = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies ?? {}).filter((name) => !name.startsWith('@billio/'));

await esbuild.build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: true,
  external,
  logLevel: 'info',
});
