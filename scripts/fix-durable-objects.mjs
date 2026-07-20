/**
 * scripts/fix-durable-objects.mjs
 *
 * WHY THIS SCRIPT EXISTS:
 * Astro's Cloudflare adapter auto-generates dist/server/entry.mjs on
 * every build, and that generated file ONLY ever exports the Astro
 * request handler:
 *
 *   export { w as default };
 *
 * It never exports Durable Object classes, no matter where in the
 * source tree they're defined or re-exported from (we tried exporting
 * ContactRateLimiter from src/middleware.ts — it gets bundled into a
 * separate internal chunk that entry.mjs never touches). Since Wrangler
 * needs the class to be a NAMED EXPORT of the actual entry file it
 * loads (per dist/server/wrangler.json's "main": "entry.mjs"), and
 * Astro regenerates that file fresh every build (any manual edit would
 * be wiped out on the next `astro build`), this script runs
 * automatically right after every build to patch it back in.
 *
 * HOW IT WORKS:
 * 1. Search every .mjs file under dist/server for the compiled
 *    ContactRateLimiter class (it ends up inside whichever chunk
 *    Vite decided to put it in — the exact filename changes between
 *    builds because of content-hashed filenames).
 * 2. Append a re-export line to entry.mjs pointing at that chunk.
 *
 * If this script ever fails to find the class, it exits with an error
 * (rather than silently building a broken worker) so CI catches it
 * immediately instead of the rate limiter silently not working in
 * production.
 */
import { readdirSync, readFileSync, appendFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const CLASS_NAME = "ContactRateLimiter";
const serverDir = join(process.cwd(), "dist", "server");
const entryFile = join(serverDir, "entry.mjs");

function walk(dir) {
  let results = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      results = results.concat(walk(full));
    } else if (name.endsWith(".mjs") && full !== entryFile) {
      results.push(full);
    }
  }
  return results;
}

const candidates = walk(serverDir);
let foundFile = null;

for (const file of candidates) {
  const content = readFileSync(file, "utf-8");
  // Matches "class ContactRateLimiter" (un-minified) - broad match on
  // purpose so this survives minor formatting/minification differences
  // between Astro/esbuild versions.
  if (content.includes(`class ${CLASS_NAME}`)) {
    foundFile = file;
    break;
  }
}

if (!foundFile) {
  console.error(
    `[fix-durable-objects] Could not find a compiled chunk containing "class ${CLASS_NAME}" anywhere under dist/server. ` +
    `The rate limiter Durable Object will NOT work until this is fixed - failing the build on purpose so this isn't missed silently.`
  );
  process.exit(1);
}

// The chunk that DEFINES the class (e.g. contact.ts's compiled chunk)
// only exports what that route needs (OPTIONS/POST) - it never exports
// the class itself. Add that export directly to the chunk before
// pointing entry.mjs at it, or the re-export below fails with
// "does not provide an export named 'ContactRateLimiter'".
const chunkContent = readFileSync(foundFile, "utf-8");
if (!new RegExp(`export\\s*\\{[^}]*\\b${CLASS_NAME}\\b`).test(chunkContent)) {
  appendFileSync(foundFile, `\nexport { ${CLASS_NAME} };\n`);
  console.log(`[fix-durable-objects] Added missing "export { ${CLASS_NAME} }" to ${relative(serverDir, foundFile)}`);
}

// Relative path from entry.mjs's own folder (dist/server) to the chunk
// that actually contains the class, in POSIX form for the import
// specifier (Windows path separators would break the ESM import).
const importPath = "./" + relative(serverDir, foundFile).split("\\").join("/");

appendFileSync(entryFile, `\nexport { ${CLASS_NAME} } from "${importPath}";\n`);
console.log(`[fix-durable-objects] Patched entry.mjs -> re-exports ${CLASS_NAME} from ${importPath}`);
