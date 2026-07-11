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
  interface Locals extends Runtime {}
}