// scripts/postbuild-durable-object.mjs
//
// @astrojs/cloudflare@13.6.1 regenerates dist/server/entry.mjs and
// dist/server/wrangler.json from scratch on every `astro build`, and has
// no option to include a custom Durable Object class in either one
// (confirmed: no "workerEntryPoint" or equivalent in this version's
// node_modules/@astrojs/cloudflare/dist/index.d.ts).
//
// This script runs AFTER `astro build` and BEFORE `wrangler deploy`
// (wired up in package.json's "build" script), and patches the
// generated output directly:
//   1. Copies ContactRateLimiter.mjs into dist/server/durable-objects/
//   2. Appends an export line to dist/server/entry.mjs so wrangler can
//      find the class by name
//   3. Injects the durable_objects binding + migration into
//      dist/server/wrangler.json, which astro build silently strips out
//      even though they're present in the source wrangler.toml

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

const distServerDir = join(projectRoot, "dist", "server");
const entryPath = join(distServerDir, "entry.mjs");
const wranglerJsonPath = join(distServerDir, "wrangler.json");
const sourceDoPath = join(projectRoot, "src", "durable-objects", "ContactRateLimiter.mjs");
const destDoDir = join(distServerDir, "durable-objects");
const destDoPath = join(destDoDir, "ContactRateLimiter.mjs");

function fail(message) {
  console.error(`[postbuild-durable-object] ERROR: ${message}`);
  process.exit(1);
}

if (!existsSync(entryPath)) fail(`entry.mjs not found at ${entryPath} - did "astro build" run first?`);
if (!existsSync(wranglerJsonPath)) fail(`wrangler.json not found at ${wranglerJsonPath}`);
if (!existsSync(sourceDoPath)) fail(`Source Durable Object file not found at ${sourceDoPath}`);

// ── 1. Copy the Durable Object class into the build output ──
mkdirSync(destDoDir, { recursive: true });
copyFileSync(sourceDoPath, destDoPath);
console.log("[postbuild-durable-object] Copied ContactRateLimiter.mjs into dist/server/durable-objects/");

// ── 2. Make entry.mjs re-export it (idempotent - skip if already patched) ──
const entryContent = readFileSync(entryPath, "utf8");
const exportLine = `\nexport { ContactRateLimiter } from "./durable-objects/ContactRateLimiter.mjs";\n`;

if (!entryContent.includes('durable-objects/ContactRateLimiter.mjs"')) {
  writeFileSync(entryPath, entryContent + exportLine, "utf8");
  console.log("[postbuild-durable-object] Appended ContactRateLimiter export to entry.mjs");
} else {
  console.log("[postbuild-durable-object] entry.mjs already patched, skipping");
}

// ── 3. Patch wrangler.json with the binding + migration astro build strips ──
const wranglerConfig = JSON.parse(readFileSync(wranglerJsonPath, "utf8"));

wranglerConfig.durable_objects = {
  bindings: [
    { name: "CONTACT_RATE_LIMITER", class_name: "ContactRateLimiter" },
  ],
};

// Only add the migration if it's not already there (avoids duplicate
// tags across repeated builds/deploys, which Cloudflare would reject).
const hasV1Migration = (wranglerConfig.migrations ?? []).some((m) => m.tag === "v1");
if (!hasV1Migration) {
  wranglerConfig.migrations = [
    ...(wranglerConfig.migrations ?? []),
    { tag: "v1", new_sqlite_classes: ["ContactRateLimiter"] },
  ];
}

writeFileSync(wranglerJsonPath, JSON.stringify(wranglerConfig, null, 2), "utf8");
console.log("[postbuild-durable-object] Patched wrangler.json with Durable Object binding + migration");

console.log("[postbuild-durable-object] Done.");
