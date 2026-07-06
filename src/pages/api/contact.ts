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

export const POST: APIRoute = async ({ request }): Promise<Response> => {
  const cors = corsHeaders(request);
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";

  // ── IP rate limit (Durable Object) ──
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
      console.error("[RateLimiter] check error:", err);
    }
  }

  let name = "", email = "", message = "";

  try {
    const ct = request.headers.get("Content-Type") ?? "";

    if (ct.includes("application/json")) {
      const b = (await request.json()) as any;
      name = b.name ?? "";
      email = b.email ?? "";
      message = b.message ?? "";
    } else {
      const f = await request.formData();
      name = f.get("name")?.toString() ?? "";
      email = f.get("email")?.toString() ?? "";
      message = f.get("message")?.toString() ?? "";
    }
  } catch {
    return json({ ok: false, error: "Invalid request body." }, 400, cors);
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