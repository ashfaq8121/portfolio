import type { APIRoute } from "astro";
import { env as cfEnv } from "cloudflare:workers";
import { validateContactForm } from "../../lib/validate";

interface ContactResponse {
  ok: boolean;
  error?: string;
  errors?: Record<string, string>;
  message?: string;
}

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

  // ── IP rate limit (Durable Object) ── checked FIRST, before we do any
  // other work — no point validating or calling Turnstile for a request
  // we're going to reject anyway. One DO instance per IP (idFromName(ip))
  // tracks that IP's own hit count in isolation from every other visitor.
  // 3 messages per IP per rolling 1-hour window — see
  // src/durable-objects/ContactRateLimiter.ts for the counting logic.
  const limiterBinding = (cfEnv as any).CONTACT_RATE_LIMITER;
  if (limiterBinding) {
    try {
      const id = limiterBinding.idFromName(ip);
      const stub = limiterBinding.get(id);
      const limitRes = await stub.fetch("https://do/check");
      const limitData = (await limitRes.json()) as {
        allowed: boolean;
        retryAfterSeconds?: number;
      };

      if (!limitData.allowed) {
        const minutes = Math.ceil((limitData.retryAfterSeconds ?? 3600) / 60);
        console.warn(`[RateLimiter] blocked IP: ${ip}`);
        return json(
          {
            ok: false,
            error: `Too many messages were sent. Wait for ${minutes} minute${minutes !== 1 ? "s" : ""}.`,
          },
          429,
          cors
        );
      }
    } catch (err) {
      // Fail OPEN, not closed: if the Durable Object itself errors, we
      // don't want a rate-limiter bug to take down the whole contact
      // form. Turnstile below is still a second line of defense.
      console.error("[RateLimiter] check error:", err);
    }
  }

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

  // ── Turnstile bot check ──
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