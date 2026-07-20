import type { APIRoute } from "astro";
import { env as cfEnv } from "cloudflare:workers";
import { validateContactForm } from "../../lib/validate";
import { ContactRateLimiter } from "../../lib/ContactRateLimiter";
export { ContactRateLimiter };

interface ContactResponse {
  ok: boolean;
  error?: string;
  errors?: Record<string, string>;
  message?: string;
}

const ONE_HOUR_MS = 60 * 60 * 1000;

function corsHeaders(request: Request): Record<string, string> {
  const allowedOrigin = (cfEnv as any).SITE_URL as string | undefined;
  const origin = request.headers.get("Origin");
  if (allowedOrigin && origin === allowedOrigin) {
    return { "Access-Control-Allow-Origin": allowedOrigin, "Vary": "Origin" };
  }
  return {};
}

function json(body: ContactResponse, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, "").trim();
}

// Verifies a Turnstile token with Cloudflare's siteverify endpoint. The
// token alone (from the client) proves nothing - it's just a string a
// bot could fake or replay. This server-side call, using the SECRET key
// that never reaches the browser, is what actually proves a human passed
// the challenge for THIS specific request.
//
// TEMP DEBUG: logging the full siteverify response (including
// error-codes) so we can see exactly why verification is failing in
// production, even though the widget itself shows "Success!" client-side.
// Remove the console.log of the raw response once this is confirmed working.
async function verifyTurnstile(token: string, secretKey: string, ip: string): Promise<boolean> {
  if (!token) {
    console.warn("[Turnstile] no token received from client");
    return false;
  }
  if (!secretKey) {
    console.warn("[Turnstile] TURNSTILE_SECRET_KEY is not set in this environment");
    return false;
  }

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: secretKey, response: token, remoteip: ip }),
    });
    const data = (await res.json()) as { success: boolean; "error-codes"?: string[] };

    if (!data.success) {
      console.warn("[Turnstile] verification failed:", JSON.stringify(data));
    }

    return data.success === true;
  } catch (err) {
    console.error("[Turnstile] verify request error:", err);
    return false;
  }
}

export const prerender = false;

export const OPTIONS: APIRoute = async ({ request }) =>
  new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(request),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });

export const POST: APIRoute = async ({ request }): Promise<Response> => {
  const cors = corsHeaders(request);
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";

  // ── Rate limit (Durable Object) ── one instance per IP, 3 msgs/hour.
  // Checked before Turnstile on purpose: Turnstile's siteverify call is
  // an outbound network request with real latency/cost, so a client
  // that's already over the limit gets rejected immediately instead of
  // paying for that round trip first.
  const rateLimiterBinding = (cfEnv as any).RATE_LIMITER;
  if (rateLimiterBinding) {
    const doId = rateLimiterBinding.idFromName(ip);
    const doStub = rateLimiterBinding.get(doId);
    const rlRes = await doStub.fetch("https://rate-limiter/check");
    const rl = (await rlRes.json()) as { allowed: boolean; retryAfterMs?: number };

    if (!rl.allowed) {
      const minutes = Math.max(1, Math.ceil((rl.retryAfterMs ?? ONE_HOUR_MS) / 60000));
      return json(
        {
          ok: false,
          error: `Too many messages sent. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
        },
        429,
        cors
      );
    }
  } else {
    console.warn("[RateLimiter] RATE_LIMITER binding not found — rate limiting is disabled this request.");
  }

  // NOTE: IP rate limiting intentionally not included here yet — planned
  // as a separate follow-up (Durable Object). Turnstile below is the only
  // bot/abuse defense on this endpoint for now.

  let name = "", email = "", message = "", turnstileToken = "";

  try {
    const ct = request.headers.get("Content-Type") ?? "";

    if (ct.includes("application/json")) {
      const b = (await request.json()) as any;
      name = b.name ?? "";
      email = b.email ?? "";
      message = b.message ?? "";
      turnstileToken = b.turnstileToken ?? "";
    } else {
      const f = await request.formData();
      name = f.get("name")?.toString() ?? "";
      email = f.get("email")?.toString() ?? "";
      message = f.get("message")?.toString() ?? "";
      turnstileToken = f.get("cf-turnstile-response")?.toString() ?? "";
    }
  } catch {
    return json({ ok: false, error: "Invalid request body." }, 400, cors);
  }

  // ── Turnstile bot check ── must pass before we touch validation or D1.
  const turnstileSecret = (cfEnv as any).TURNSTILE_SECRET_KEY as string | undefined;
  const humanVerified = await verifyTurnstile(turnstileToken, turnstileSecret ?? "", ip);
  if (!humanVerified) {
    return json({ ok: false, error: "Bot verification failed. Please try again." }, 403, cors);
  }

  name = stripHtml(name);
  email = stripHtml(email).toLowerCase();
  message = stripHtml(message);

  // ── Validation ── uses validate.ts
  const errors = validateContactForm({ name, email, message });
  if (Object.keys(errors).length > 0) {
    return json({ ok: false, errors }, 422, cors);
  }

  const db = (cfEnv as any).DB;

  // ── STEP 1: ALWAYS save to D1 database ───────────────────────────────
  let savedToDb = false;
  if (db) {
    try {
      await db
        .prepare(`INSERT INTO contact_submissions (name, email, message, ip) VALUES (?, ?, ?, ?)`)
        .bind(name, email, message, ip)
        .run();
      savedToDb = true;
      console.log("[D1] ✅ Submission saved successfully");
    } catch (err) {
      console.error("[D1] ❌ Save error:", err);
    }
  }

  // ── STEP 2: ALWAYS return success to user ────────────────────────────
  // Web3Forms email is sent client-side from contact.astro after this
  // endpoint responds. D1 above is the durable record regardless of
  // whether that client-side email send succeeds.
  return json({ 
    ok: true, 
    message: "Message sent! I will get back to you soon." 
  }, 200, cors);
};