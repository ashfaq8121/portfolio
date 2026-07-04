/**
 * src/middleware.ts
 *
 * Runs on every request (pages + API routes) before the response is sent.
 * Sets a strict Content-Security-Policy and standard security headers.
 *
 * Why a middleware instead of per-route headers: CSP and friends are
 * site-wide concerns, not endpoint-specific. Centralizing them here means
 * a new route can't accidentally ship without protection — it's applied
 * even to routes nobody remembers to update.
 *
 * NONCE: contact.astro and ask.astro each have an inline <script> block
 * (form-submit handling / chat widget logic). A strict CSP without
 * 'unsafe-inline' blocks ANY inline script by default — including our own
 * first-party ones — which is exactly what was breaking the contact form
 * and chatbot in production (browser console: "Executing inline script
 * violates ... script-src ... The action has been blocked."). Rather than
 * loosen the policy with 'unsafe-inline' (which would let an attacker's
 * injected inline script run too, defeating the point of CSP), we generate
 * a random, single-use nonce per request here, expose it via
 * context.locals.cspNonce, and each .astro page adds nonce={nonce} to its
 * own <script> tags. Only scripts carrying that exact nonce are allowed to
 * run — ours (which know it) and nobody else's (which can't guess it).
 */
import { defineMiddleware } from "astro:middleware";

// Cloudflare's Turnstile widget needs to load its script and call back
// to its own origin — these are the only third-party origins this site
// trusts. Keep this list short; every entry here is a hole in the policy.
const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com";
// Web3Forms' free tier requires submissions to come directly from the
// visitor's browser, not proxied through our Worker — so the client
// script calls this origin directly and it needs to be allow-listed.
const WEB3FORMS_API_SRC = "https://api.web3forms.com";
// Google Fonts needs two separate origins allow-listed: the stylesheet
// (which declares @font-face rules) is served from googleapis.com, but
// the actual font files it references are served from a *different*
// origin, gstatic.com. Missing either one silently breaks font loading
// — the request just gets blocked by CSP with no visible error unless
// you check the console/network tab, which is what happened here.
const GOOGLE_FONTS_CSS_SRC = "https://fonts.googleapis.com";
const GOOGLE_FONTS_FILE_SRC = "https://fonts.gstatic.com";

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export const onRequest = defineMiddleware(async (context, next) => {
  const nonce = generateNonce();
  // Exposed so any .astro page can read it: const nonce = Astro.locals.cspNonce;
  // then add nonce={nonce} to its own <script> tags.
  (context.locals as any).cspNonce = nonce;

  const response = await next();

  // Clone-and-set rather than mutate in place: Response headers from some
  // adapters are immutable once constructed.
  const headers = new Headers(response.headers);

  headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      // 'self' covers our own bundled JS. 'nonce-...' allows this specific
      // request's first-party inline <script> blocks (see file header
      // comment above). Turnstile's script is the one legitimate external
      // script this site loads.
      `script-src 'self' 'nonce-${nonce}' ${TURNSTILE_SCRIPT_SRC}`,
      // Inline <style> blocks are used in .astro components' scoped styles,
      // which Astro injects as inline <style> tags at build time — there is
      // no practical way to hash/nonce every one of these without breaking
      // Astro's own scoping mechanism, so this is an accepted, documented
      // exception (see DECISIONS.md), not an oversight.
      `style-src 'self' 'unsafe-inline' ${GOOGLE_FONTS_CSS_SRC}`,
      "img-src 'self' data:",
      `font-src 'self' ${GOOGLE_FONTS_FILE_SRC}`,
      // XHR/fetch targets: our own API routes, plus Turnstile's verify
      // callback origin.
      `connect-src 'self' ${TURNSTILE_SCRIPT_SRC} ${WEB3FORMS_API_SRC}`,
      `frame-src ${TURNSTILE_SCRIPT_SRC}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      "upgrade-insecure-requests",
    ].join("; ")
  );

  // Prevents the browser from MIME-sniffing a response into an
  // executable type it wasn't served as.
  headers.set("X-Content-Type-Options", "nosniff");

  // Backstop against this site being framed for clickjacking, even
  // though frame-ancestors above is the modern, more flexible control.
  headers.set("X-Frame-Options", "SAMEORIGIN");

  // Don't leak our own full URL (e.g. with query params) to third-party
  // sites we link out to (GitHub, LinkedIn, WhatsApp, etc).
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Tell browsers to only ever connect over HTTPS for the next year,
  // including subdomains — meaningful once this is live on a real domain.
  headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains"
  );

  // Disable powerful browser features this site never uses, so an XSS
  // that slips through can't escalate into camera/mic/geolocation access.
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()"
  );

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});