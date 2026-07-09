/**
 * src/middleware.ts
 *
 * Runs before every single request, on every route, and adds security
 * headers to the response on its way out. Using Astro middleware instead
 * of adding headers manually inside chat.ts / contact.ts / every page
 * means new routes get these headers automatically too, with nothing to
 * remember to copy-paste — one place to update if a header ever needs to
 * change.
 *
 * CSP note: the source list below is deliberately built from what this
 * site ACTUALLY calls, not a generic template —
 *   - api.web3forms.com   -> contact.astro's client-side email send
 *   - challenges.cloudflare.com -> Turnstile widget (once added)
 *   - static.cloudflareinsights.com -> Cloudflare's analytics beacon
 *     (visible calling beacon.min.js in earlier Network tab captures)
 *   - fonts.googleapis.com / fonts.gstatic.com -> web fonts
 * If a future feature calls a new external host, its CSP directive must
 * be added here too, or that request will be silently blocked by the
 * browser — this is the correct failure mode (fail closed), but worth
 * knowing so a new integration doesn't look like a mystery bug later.
 */
import { defineMiddleware } from "astro:middleware";

const CSP = [
  "default-src 'self'",
  // 'unsafe-inline' is required here because contact.astro / ask.astro use
  // inline <script> tags directly in the page rather than external .js
  // files. This is a deliberate, documented tradeoff (see DECISIONS.md) —
  // the stronger fix is migrating those scripts to external files with a
  // nonce or hash-based CSP instead, which was out of scope for this pass.
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  "connect-src 'self' https://api.web3forms.com https://static.cloudflareinsights.com",
  "frame-src https://challenges.cloudflare.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://api.web3forms.com",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();

  response.headers.set("Content-Security-Policy", CSP);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  // Only meaningful over HTTPS (which Cloudflare Workers always serve as) —
  // tells browsers to remember to always use HTTPS for this domain for the
  // next year, even if someone types an http:// link.
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");

  return response;
});