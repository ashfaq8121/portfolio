import type { APIRoute } from "astro";
import { env as cfEnv } from "cloudflare:workers";
import { readVerifiedEmails } from "../../lib/otp";

const WEB3FORMS_KEY = "669eaee5-ea7c-4270-840a-e1a26ed3d88c";

const IP_RATE_LIMIT = 5;
const IP_RATE_WINDOW_SECONDS = 3600; // 1 hour, window starts at first message
const EMAIL_RATE_LIMIT = 3;
const EMAIL_RATE_WINDOW_SECONDS = 3600; // 1 hour, window starts at first message

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

function json(body: ContactResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
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

// Gmail-only regex
const GMAIL_RE = /^[^\s@]+@gmail\.com$/i;

export const POST: APIRoute = async ({ request }): Promise<Response> => {
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
    return json({ ok: false, error: "Invalid request body." }, 400);
  }

  name = stripHtml(name);
  email = stripHtml(email).toLowerCase();
  message = stripHtml(message);

  const errors: Record<string, string> = {};

  // Name validation
  if (!name) {
    errors.name = "Name is required.";
  } else if (name.length < 2) {
    errors.name = "Name must be at least 2 characters.";
  } else if (name.length > 100) {
    errors.name = "Name must be 100 characters or fewer.";
  }

  // Email validation — order: empty → too long → invalid format → non-Gmail
  if (!email) {
    errors.email = "Email is required.";
  } else if (email.length > 254) {
    errors.email = "Email address is too long.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    errors.email = "Please enter a valid email address.";
  } else if (!GMAIL_RE.test(email)) {
    errors.email = "Only Gmail addresses are accepted (e.g. yourname@gmail.com).";
  }

  // Message validation
  if (!message) {
    errors.message = "Message is required.";
  } else if (message.length < 10) {
    errors.message = "Message must be at least 10 characters.";
  } else if (message.length > 4000) {
    errors.message = "Message must be 4,000 characters or fewer.";
  }

  if (Object.keys(errors).length > 0) {
    return json({ ok: false, errors }, 422);
  }

  // ── Must have completed OTP verification for this email, on this browser ──
  const secret = (cfEnv as any).OTP_SIGNING_SECRET;
  if (!secret) {
    console.error("contact.ts missing OTP_SIGNING_SECRET.");
    return json({ ok: false, error: "Server not configured." }, 500);
  }
  const cookieHeader = request.headers.get("Cookie") ?? "";
  const verifiedEmails = await readVerifiedEmails(cookieHeader, secret);
  if (!verifiedEmails.includes(email)) {
    return json(
      { ok: false, error: "Please verify your email with the code sent to it before sending a message." },
      403
    );
  }

  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const kv = (cfEnv as any).RATE_LIMIT_KV;
  const db = (cfEnv as any).DB;

  // ── Two independent fixed-window limits: per IP and per email ───────────
  // Both windows start counting from the FIRST message, not the latest.
  // We peek both before writing either, so a block on one doesn't burn
  // a "slot" on the other for a message that never actually sends.
  const now = Math.floor(Date.now() / 1000);

  async function peek(key: string): Promise<RateLimitData | null> {
    if (!kv) return null;
    try {
      return (await kv.get(key, { type: "json" })) as RateLimitData | null;
    } catch (err) {
      console.error("Rate-limit read error:", err);
      return null;
    }
  }

  function secondsUntilUnblocked(stored: RateLimitData | null, limit: number): number | null {
    if (!stored || now >= stored.expiresAt) return null;
    if (stored.count >= limit) return stored.expiresAt - now;
    return null;
  }

  async function bump(key: string, stored: RateLimitData | null, windowSeconds: number): Promise<void> {
    if (!kv) return;
    const next: RateLimitData =
      !stored || now >= stored.expiresAt
        ? { count: 1, expiresAt: now + windowSeconds }
        : { count: stored.count + 1, expiresAt: stored.expiresAt };
    try {
      await kv.put(key, JSON.stringify(next), { expiration: next.expiresAt });
    } catch (err) {
      console.error("Rate-limit write error:", err);
    }
  }

  const ipKey = `msg-ip:${ip}`;
  const emailKey = `msg-email:${email}`;

  const ipStored = await peek(ipKey);
  const ipBlockedIn = secondsUntilUnblocked(ipStored, IP_RATE_LIMIT);
  if (ipBlockedIn !== null) {
    const mins = Math.ceil(ipBlockedIn / 60);
    return json(
      { ok: false, error: `Too many messages from this network. Try again in ${mins} minute${mins !== 1 ? "s" : ""}.` },
      429
    );
  }

  const emailStored = await peek(emailKey);
  const emailBlockedIn = secondsUntilUnblocked(emailStored, EMAIL_RATE_LIMIT);
  if (emailBlockedIn !== null) {
    const mins = Math.ceil(emailBlockedIn / 60);
    return json(
      { ok: false, error: `Too many messages from this email. Try again in ${mins} minute${mins !== 1 ? "s" : ""}.` },
      429
    );
  }

  await bump(ipKey, ipStored, IP_RATE_WINDOW_SECONDS);
  await bump(emailKey, emailStored, EMAIL_RATE_WINDOW_SECONDS);
  // ──────────────────────────────────────────────────────────────────────────

  // Save allowed submission to D1
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

  // Send email via Web3Forms — done once, server-side only.
  // (Previously this was ALSO fired client-side in contact.astro, causing
  // duplicate emails. The client-side call has been removed.)
  try {
    const res = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_key: WEB3FORMS_KEY,
        name,
        email,
        message,
        subject: "[Portfolio Contact] Message from " + name,
        from_name: name,
        replyto: email,
      }),
    });

    const data = (await res.json()) as any;

    if (!data.success) {
      console.error("Web3Forms error:", data);
    }
  } catch (err) {
    console.error("Web3Forms fetch error:", err);
  }

  return json({ ok: true, message: "Message sent! I will get back to you soon." });
};
