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

/**
 * Verify Cloudflare Turnstile token server-side
 */
async function verifyTurnstile(token: string, secretKey: string, remoteIp?: string): Promise<boolean> {
  const formData = new URLSearchParams();
  formData.append("secret", secretKey);
  formData.append("response", token);
  if (remoteIp) formData.append("remoteip", remoteIp);

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });

    const data = (await res.json()) as any;
    if (!data.success) {
      console.warn("[Turnstile] verification failed:", data["error-codes"]);
    }
    return data.success === true;
  } catch (err) {
    console.error("[Turnstile] verify error:", err);
    return false;
  }
}

export const POST: APIRoute = async ({ request }): Promise<Response> => {
  const cors = corsHeaders(request);
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";

  // ── IP rate limit (Durable Object) ──
  // Runs first, before parsing or Turnstile, since it's the cheapest
  // check and blocks abuse before we spend a Turnstile verify call.
  // 3 messages per IP per rolling-off 1-hour window, counted from the
  // first message in that window (not a sliding window). Uses a
  // Durable Object rather than KV because DO reads/writes for a given
  // IP are strictly serialized on one instance — no eventual-
  // consistency gap for two near-simultaneous requests to both slip
  // through, which KV's ~60s cross-edge propagation delay allows.
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
            error: `Too many messages from this IP. Try again in ${minutes} minute${minutes !== 1 ? "s" : ""}.`,
          },
          429,
          cors
        );
      }
    } catch (err) {
      // Fail open rather than break the form if the DO itself errors —
      // Turnstile is still there as a second layer of defense.
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
      turnstileToken = f.get("turnstileToken")?.toString() ?? "";
    }
  } catch {
    return json({ ok: false, error: "Invalid request body." }, 400, cors);
  }

  name = stripHtml(name);
  email = stripHtml(email).toLowerCase();
  message = stripHtml(message);
  turnstileToken = stripHtml(turnstileToken);

  // ── Turnstile verification ──
  const turnstileSecret = (cfEnv as any).TURNSTILE_SECRET_KEY;
  if (!turnstileSecret) {
    console.error("[Turnstile] TURNSTILE_SECRET_KEY not configured.");
    return json({ ok: false, error: "Server not configured for bot protection." }, 500, cors);
  }

  if (!turnstileToken) {
    return json({ ok: false, error: "Please complete the bot verification challenge." }, 400, cors);
  }

  const isHuman = await verifyTurnstile(turnstileToken, turnstileSecret, ip);

  if (!isHuman) {
    console.warn(`[Turnstile] Failed verification for IP: ${ip}`);
    return json({ ok: false, error: "Bot verification failed. Please try again." }, 403, cors);
  }

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
  // Email is NOT sent from here. Web3Forms' free tier rejects requests
  // proxied through a backend/Worker — it only accepts submissions that
  // originate directly from the visitor's browser. So contact.astro's
  // client script makes a second, separate request straight to Web3Forms
  // after this endpoint responds. D1 above is the durable record
  // regardless of whether that client-side email send succeeds.
  // User sees: "Message sent! I will get back to you soon."
  return json({ 
    ok: true, 
    message: "Message sent! I will get back to you soon." 
  }, 200, cors);
};