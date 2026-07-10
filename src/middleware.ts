/**
 * src/middleware.ts
 *
 * Adds security headers to every response. The CSP uses a per-request
 * NONCE for script-src instead of 'unsafe-inline' — this is the real fix
 * for the securityheaders.com warning, without breaking the inline
 * <script> blocks that ask.astro and contact.astro currently rely on.
 *
 * How the nonce approach works: a fresh random value is generated on
 * EVERY request (never reused — reusing a nonce defeats its purpose,
 * since an attacker could then reference the same value). That value is
 * (a) put in the CSP header as 'nonce-<value>', and (b) stored on
 * Astro.locals so every .astro page being rendered THIS request can read
 * it and stamp the exact same value onto its own <script nonce="..."> tags.
 * Because the value is unpredictable and different every request, a
 * script an attacker injects some other way has no way to know or guess
 * the current nonce, so the browser refuses to run it — while your own
 * legitimate inline scripts, which read the correct nonce straight from
 * Astro.locals, run normally.
 *
 * IMPORTANT: every existing inline <script> tag in the codebase must be
 * updated to include nonce={Astro.locals.nonce} or it will stop running
 * under this policy. See the two files listed below.
 */
import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(async (context, next) => {
  // Fresh, unguessable value every single request.
  const nonce = crypto.randomUUID();
  context.locals.nonce = nonce;

  const response = await next();

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com https://static.cloudflareinsights.com`,
    // style-src keeps 'unsafe-inline' — Astro's scoped component styles are
    // injected as inline <style> tags at build time in a way that's
    // impractical to nonce individually; this is a much lower-risk
    // exception than script-src (CSS can't exfiltrate data or run
    // arbitrary logic the way injected JS can), documented as an accepted
    // tradeoff in DECISIONS.md.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "connect-src 'self' https://api.web3forms.com https://static.cloudflareinsights.com https://cloudflareinsights.com",
    "frame-src https://challenges.cloudflare.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://api.web3forms.com",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");

  return response;
});