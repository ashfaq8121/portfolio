/**
 * contact.ts — Contact Form API Handler
 * Cloudflare Worker route: POST /api/contact
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Env {
  RATE_LIMIT_KV: KVNamespace;
  DB?: D1Database;
  TO_EMAIL: string;
  OWNER_NAME: string;
  RESEND_API_KEY: string;
}

interface ContactPayload {
  name: string;
  email: string;
  message: string;
}

interface ValidationResult {
  ok: boolean;
  errors: Record<string, string>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const RATE_LIMIT = 5;
const RATE_WINDOW = 60 * 60;

// ─── Validation ──────────────────────────────────────────────────────────────

function validate(data: Partial<ContactPayload>): ValidationResult {
  const errors: Record<string, string> = {};

  const name = (data.name ?? "").trim();
  const email = (data.email ?? "").trim();
  const message = (data.message ?? "").trim();

  if (name.length < 2) {
    errors.name = "Name must be at least 2 characters.";
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    errors.email = "A valid email address is required.";
  }

  if (message.length < 10) {
    errors.message = "Message must be at least 10 characters.";
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

// ─── Rate Limiting ───────────────────────────────────────────────────────────

async function isRateLimited(kv: KVNamespace, ip: string): Promise<boolean> {
  const key = `ratelimit:${ip}`;
  const current = await kv.get(key);
  const count = current ? parseInt(current, 10) : 0;

  if (count >= RATE_LIMIT) return true;

  await kv.put(key, String(count + 1), { expirationTtl: RATE_WINDOW });
  return false;
}

// ─── Email via Resend ─────────────────────────────────────────────────────────

async function sendEmail(
  toEmail: string,
  ownerName: string,
  data: ContactPayload,
  apiKey: string
): Promise<boolean> {
  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f4;padding:20px;margin:0;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
    <div style="background:#1a1a2e;padding:24px 32px;">
      <h2 style="color:#fff;margin:0;font-size:20px;">📬 New Portfolio Contact</h2>
    </div>
    <div style="padding:32px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:10px 0;color:#666;font-size:14px;width:80px;vertical-align:top;"><strong>Name</strong></td>
          <td style="padding:10px 0;color:#111;font-size:15px;">${escapeHtml(data.name)}</td>
        </tr>
        <tr style="border-top:1px solid #eee;">
          <td style="padding:10px 0;color:#666;font-size:14px;vertical-align:top;"><strong>Email</strong></td>
          <td style="padding:10px 0;font-size:15px;">
            <a href="mailto:${escapeHtml(data.email)}" style="color:#4f46e5;">${escapeHtml(data.email)}</a>
          </td>
        </tr>
        <tr style="border-top:1px solid #eee;">
          <td style="padding:10px 0;color:#666;font-size:14px;vertical-align:top;"><strong>Message</strong></td>
          <td style="padding:10px 0;color:#111;font-size:15px;line-height:1.6;">
            ${escapeHtml(data.message).replace(/\n/g, "<br>")}
          </td>
        </tr>
      </table>
      <div style="margin-top:24px;padding:16px;background:#f0f4ff;border-radius:6px;font-size:13px;color:#666;">
        💡 Hit <strong>Reply</strong> to respond directly to ${escapeHtml(data.name)}.
      </div>
    </div>
    <div style="padding:16px 32px;background:#f9f9f9;font-size:12px;color:#999;text-align:center;">
      Sent from your portfolio contact form · Cloudflare Workers
    </div>
  </div>
</body>
</html>`;

  const plainText =
    `New message from your portfolio contact form\n\n` +
    `Name: ${data.name}\nEmail: ${data.email}\n\nMessage:\n${data.message}`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: "Portfolio Contact <onboarding@resend.dev>",
      to: [toEmail],
      reply_to: data.email,
      subject: `[Portfolio Contact] Message from ${data.name}`,
      html: htmlBody,
      text: plainText,
    }),
  });

  return res.status === 200 || res.status === 201;
}

// ─── D1 Storage (optional) ───────────────────────────────────────────────────

async function storeSubmission(
  db: D1Database,
  data: ContactPayload,
  ip: string
): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS contact_submissions (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT    NOT NULL,
        email      TEXT    NOT NULL,
        message    TEXT    NOT NULL,
        ip         TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    )
    .run();

  await db
    .prepare(
      `INSERT INTO contact_submissions (name, email, message, ip) VALUES (?, ?, ?, ?)`
    )
    .bind(data.name, data.email, data.message, ip)
    .run();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// ─── Main Handler ────────────────────────────────────────────────────────────

export async function handleContact(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed." }, 405);
  }

  let raw: Partial<ContactPayload> = {};
  const contentType = request.headers.get("Content-Type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      raw = await request.json();
    } else {
      const form = await request.formData();
      raw = {
        name: form.get("name")?.toString() ?? "",
        email: form.get("email")?.toString() ?? "",
        message: form.get("message")?.toString() ?? "",
      };
    }
  } catch {
    return json({ ok: false, error: "Invalid request body." }, 400);
  }

  const { ok, errors } = validate(raw);
  if (!ok) {
    return json({ ok: false, errors }, 422);
  }

  const data: ContactPayload = {
    name: raw.name!.trim(),
    email: raw.email!.trim(),
    message: raw.message!.trim(),
  };

  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const limited = await isRateLimited(env.RATE_LIMIT_KV, ip);
  if (limited) {
    return json(
      { ok: false, error: "Too many messages. Please try again later." },
      429
    );
  }

  if (env.DB) {
    try {
      await storeSubmission(env.DB, data, ip);
    } catch (err) {
      console.error("D1 storage error:", err);
    }
  }

  const sent = await sendEmail(
    env.TO_EMAIL,
    env.OWNER_NAME,
    data,
    env.RESEND_API_KEY
  );

  if (!sent) {
    return json(
      { ok: false, error: "Could not send your message. Please try again." },
      500
    );
  }

  return json({ ok: true, message: "Message sent! I'll get back to you soon." });
}