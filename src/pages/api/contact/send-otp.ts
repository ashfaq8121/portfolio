import type { APIRoute } from "astro";
import { env as cfEnv } from "cloudflare:workers";

export const prerender = false;

const WEB3FORMS_KEY = "669eaee5-ea7c-4270-840a-e1a26ed3d88c";
const OTP_TTL_SECONDS = 600; // 10 minutes
const OTP_RATE_LIMIT = 3;     // max 3 OTP requests
const OTP_RATE_WINDOW_SECONDS = 3600; // per hour, per IP

const GMAIL_RE = /^[^\s@]+@gmail\.com$/i;

interface PendingSubmission {
  name: string;
  email: string;
  message: string;
  otp: string;
  attempts: number; // wrong-OTP attempts, to stop guessing
}

interface OtpRateData {
  count: number;
  expiresAt: number;
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, "").trim();
}

function generateOtp(): string {
  // 6-digit numeric code, e.g. "042913"
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return n.toString().padStart(6, "0");
}

function generateRequestId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const POST: APIRoute = async ({ request }): Promise<Response> => {
  let name = "", email = "", message = "";

  try {
    const body = (await request.json()) as any;
    name = body.name ?? "";
    email = body.email ?? "";
    message = body.message ?? "";
  } catch {
    return json({ ok: false, error: "Invalid request body." }, 400);
  }

  name = stripHtml(name);
  email = stripHtml(email);
  message = stripHtml(message);

  // ── Same validation rules as before — checked here, BEFORE sending any OTP ──
  const errors: Record<string, string> = {};

  if (!name) errors.name = "Name is required.";
  else if (name.length < 2) errors.name = "Name must be at least 2 characters.";
  else if (name.length > 100) errors.name = "Name must be 100 characters or fewer.";

  if (!email) errors.email = "Email is required.";
  else if (email.length > 254) errors.email = "Email address is too long.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = "Please enter a valid email address.";
  else if (!GMAIL_RE.test(email)) errors.email = "Only Gmail addresses are accepted (e.g. yourname@gmail.com).";

  if (!message) errors.message = "Message is required.";
  else if (message.length < 10) errors.message = "Message must be at least 10 characters.";
  else if (message.length > 4000) errors.message = "Message must be 4,000 characters or fewer.";

  if (Object.keys(errors).length > 0) {
    return json({ ok: false, errors }, 422);
  }

  const kv = (cfEnv as any).RATE_LIMIT_KV;
  if (!kv) {
    return json({ ok: false, error: "Service temporarily unavailable." }, 503);
  }

  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";

  // ── Rate limit OTP requests per IP — stops someone spamming OTP emails ──
  try {
    const rlKey = `otp-rate:${ip}`;
    const now = Math.floor(Date.now() / 1000);
    const stored = (await kv.get(rlKey, { type: "json" })) as OtpRateData | null;

    if (stored && now < stored.expiresAt && stored.count >= OTP_RATE_LIMIT) {
      return json({ ok: false, error: "Too many OTP requests. Please try again later." }, 429);
    }

    const updated: OtpRateData =
      !stored || now >= stored.expiresAt
        ? { count: 1, expiresAt: now + OTP_RATE_WINDOW_SECONDS }
        : { count: stored.count + 1, expiresAt: stored.expiresAt };

    await kv.put(rlKey, JSON.stringify(updated), { expiration: updated.expiresAt });
  } catch (err) {
    console.error("OTP rate-limit error:", err);
  }

  // ── Generate OTP + a request id, store the pending submission together ──
  const otp = generateOtp();
  const requestId = generateRequestId();

  const pending: PendingSubmission = { name, email, message, otp, attempts: 0 };

  try {
    await kv.put(`otp-pending:${requestId}`, JSON.stringify(pending), {
      expiration: Math.floor(Date.now() / 1000) + OTP_TTL_SECONDS,
    });
  } catch (err) {
    console.error("OTP store error:", err);
    return json({ ok: false, error: "Could not start verification. Please try again." }, 500);
  }

  // ── Email the OTP via Web3Forms ──
  try {
    const res = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_key: WEB3FORMS_KEY,
        // Sending TO the visitor's own email — Web3Forms delivers to the
        // account tied to the access key, so the OTP email body itself
        // must clearly show the code; reply-to is the visitor for context.
        subject: "Your verification code",
        from_name: "Ashfaq's Portfolio",
        message: `Your verification code is: ${otp}\n\nThis code expires in 10 minutes.\nIf you didn't request this, you can ignore this email.`,
        email,
      }),
    });
    const data = (await res.json()) as any;
    if (!data.success) {
      console.error("Web3Forms OTP send error:", data);
    }
  } catch (err) {
    console.error("Web3Forms OTP fetch error:", err);
    return json({ ok: false, error: "Could not send verification email. Please try again." }, 502);
  }

  return json({ ok: true, requestId, message: "Verification code sent. Please check your email." });
};
