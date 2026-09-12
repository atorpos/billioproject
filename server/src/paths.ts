import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolves a project path that lives somewhere above this module.
 *
 * The server runs from two different layouts: `server/src/**` under tsx in
 * development, and a single bundled `server/dist/index.js` in production.
 * Hard-coding a relative depth works in one layout and silently breaks in the
 * other, so we walk upwards and stop at the first hit instead.
 */
export function findUpwards(relative: string, maxDepth = 6): string | null {
  let dir = here;

  for (let depth = 0; depth <= maxDepth; depth += 1) {
    const candidate = path.resolve(dir, relative);
    if (fs.existsSync(candidate)) return candidate;

    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}
