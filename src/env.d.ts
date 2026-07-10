/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

interface Env {
  RATE_LIMIT_KV: KVNamespace;
  DB: D1Database;
  TO_EMAIL: string;
  OWNER_NAME: string;
  RESEND_API_KEY: string;
}

declare namespace App {
  
  interface Locals {
    nonce: string;
  }
  interface Locals extends Runtime {}
}
// Add this to your existing src/env.d.ts (merge with whatever's already
// there — don't just overwrite the file if it has other content).
// This tells TypeScript that context.locals.nonce / Astro.locals.nonce
// is a real, typed property, set by middleware.ts on every request.