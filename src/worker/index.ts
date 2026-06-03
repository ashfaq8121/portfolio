/**
 * index.ts — Cloudflare Worker entry point
 *
 * Routes:
 *   POST /api/contact  → contact form handler
 *   GET  /*            → served by Static Assets (your Astro build)
 */

import { handleContact, Env } from "./api/contact";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // ── API routes ──────────────────────────────────────────────────────────
    if (url.pathname === "/api/contact") {
      return handleContact(request, env);
    }

    // ── All other routes: fall through to Static Assets ────────────────────
    // Cloudflare handles this automatically when you set up Static Assets
    // in wrangler.toml. This line is a safe fallback.
    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
