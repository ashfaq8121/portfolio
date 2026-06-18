import type { APIRoute } from "astro";
import { env as cfEnv } from "cloudflare:workers";

const RATE_LIMIT = 3;
const RATE_WINDOW_SECONDS = 3600;

interface ContactResponse {
  ok: boolean;
  error?: string;
  errors?: Record<string, string>;
  message?: string;
}

interface RateLimitData {
  count: number;
  expiresAt: number;
}

interface OtpRecord {
  otp: string;
  attempts: number;
  verified: boolean;
}

function json(body: ContactResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, "").trim();
}

export const prerender = false;

export const OPTIONS: APIRoute = async () =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });

export const POST: APIRoute = async ({ request }): Promise<Response> => {
  let name = "", email = "", message = "";

  try {
    const b = (await request.json()) as any;
    name = b.name ?? "";
    email = b.email ?? "";
    message = b.message ?? "";
  } catch {
    return json({ ok: false, error: "Invalid request body." }, 400);
  }

  name = stripHtml(name);
  email = stripHtml(email);
  message = stripHtml(message);

  const errors: Record<string, string> = {};

  if (!name) errors.name = "Name is required.";
  else if (name.length < 2) errors.name = "Name must be at least 2 characters.";
  else if (name.length > 100) errors.name = "Name must be 100 characters or fewer.";

  if (!message) errors.message = "Message is required.";
  else if (message.length < 10) errors.message = "Message must be at least 10 characters.";
  else if (message.length > 4000) errors.message = "Message must be 4,000 characters or fewer.";

  if (Object.keys(errors).length > 0) {
    return json({ ok: false, errors }, 422);
  }

  // ── This is the key check: the email must already be OTP-verified ──
  const kv = (cfEnv as any).RATE_LIMIT_KV;
  const db = (cfEnv as any).DB;

  if (!kv) {
    return json({ ok: false, error: "Service temporarily unavailable." }, 503);
  }

  const otpKey = `otp:${email.toLowerCase().trim()}`;
  const record = (await kv.get(otpKey, { type: "json" })) as OtpRecord | null;

  if (!record || !record.verified) {
    return json(
      { ok: false, error: "Please verify your email before sending a message." },
      403
    );
  }

  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";

  // ── Fixed-window rate limit (separate from OTP rate limit) ──
  if (kv) {
    try {
      const key = `ratelimit:${ip}`;
      const now = Math.floor(Date.now() / 1000);
      const stored = (await kv.get(key, { type: "json" })) as RateLimitData | null;

      if (!stored || now >= stored.expiresAt) {
        const freshData: RateLimitData = { count: 1, expiresAt: now + RATE_WINDOW_SECONDS };
        await kv.put(key, JSON.stringify(freshData), { expiration: freshData.expiresAt });
      } else {
        if (stored.count >= RATE_LIMIT) {
          return json({ ok: false, error: "Too many messages. Please try again in an hour." }, 429);
        }
        const updatedData: RateLimitData = { count: stored.count + 1, expiresAt: stored.expiresAt };
        await kv.put(key, JSON.stringify(updatedData), { expiration: updatedData.expiresAt });
      }
    } catch (err) {
      console.error("KV rate-limit error:", err);
    }
  }

  // Save to D1
  if (db) {
    try {
      await db
        .prepare(`INSERT INTO contact_submissions (name, email, message, ip) VALUES (?, ?, ?, ?)`)
        .bind(name, email, message, ip)
        .run();
    } catch (err) {
      console.error("D1 save error:", err);
    }
  }

  // ── Consume the verified OTP record so it can't be reused for a second message ──
  try {
    await kv.delete(otpKey);
  } catch (err) {
    console.error("Could not clear OTP record:", err);
  }

  // NOTE: the actual email is sent client-side by contact.astro right after
  // this responds — Web3Forms' free plan blocks server-side (Worker) calls,
  // so the Worker's job here is purely validation, rate limiting, and the D1 save.
  return json({ ok: true, message: "Message sent! I will get back to you soon." });
};