import type { APIRoute } from "astro";
import { env as cfEnv } from "cloudflare:workers";
import { validateContactForm } from "../../lib/validate";

interface ContactResponse {
  ok: boolean;
  error?: string;
  errors?: Record<string, string>;
  message?: string;
}

function corsHeaders(request: Request, env: any): Record<string, string> {
  const allowedOrigin = env?.SITE_URL as string | undefined;
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

export const OPTIONS: APIRoute = async (context) => {
  const env = (context.locals as any)?.runtime?.env ?? cfEnv;
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(context.request, env),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
};

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

export const POST: APIRoute = async (context): Promise<Response> => {
  const { request, locals } = context;
  // Same fix as chat.ts: read bindings via the Astro Cloudflare adapter's
  // standard context.locals.runtime.env path first, falling back to the
  // cloudflare:workers module import for setups where locals.runtime isn't
  // populated. Relying on cloudflare:workers alone is what silently broke
  // things last time.
  const env = (locals as any)?.runtime?.env ?? cfEnv;
  const cors = corsHeaders(request, env);
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";

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
  const turnstileSecret = env?.TURNSTILE_SECRET_KEY;
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

  const db = env?.DB;

  // ── Save to D1 — this is the source of truth for every submission ──
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
      console.error("[D1] ❌ Insert failed:", err);
    }
  } else {
    console.error("[D1] DB binding missing — check wrangler.toml [[d1_databases]].");
  }

  // Email delivery happens client-side (see contact.astro) — Web3Forms'
  // free tier only accepts submissions that originate directly from the
  // visitor's browser and rejects anything sent from a Worker/backend, so
  // there's no point attempting it here. D1 above is the reliable record;
  // the client-side Web3Forms call is what actually lands the email in
  // your Gmail inbox.
  return json({
    ok: true,
    message: savedToDb
      ? "Message saved successfully. I'll get back to you soon!"
      : "Message received! I'll get back to you soon.",
  }, 200, cors);
};