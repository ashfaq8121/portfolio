import type { APIRoute } from "astro";
import { env as cfEnv } from "cloudflare:workers";

export const prerender = false;

const WEB3FORMS_KEY = "669eaee5-ea7c-4270-840a-e1a26ed3d88c";
const MAX_OTP_ATTEMPTS = 5;

interface PendingSubmission {
  name: string;
  email: string;
  message: string;
  otp: string;
  attempts: number;
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

export const POST: APIRoute = async ({ request }): Promise<Response> => {
  let requestId = "", otp = "";

  try {
    const body = (await request.json()) as any;
    requestId = body.requestId ?? "";
    otp = (body.otp ?? "").toString().trim();
  } catch {
    return json({ ok: false, error: "Invalid request body." }, 400);
  }

  if (!requestId || !otp) {
    return json({ ok: false, error: "Request ID and code are required." }, 400);
  }

  const kv = (cfEnv as any).RATE_LIMIT_KV;
  const db = (cfEnv as any).DB;

  if (!kv) {
    return json({ ok: false, error: "Service temporarily unavailable." }, 503);
  }

  const pendingKey = `otp-pending:${requestId}`;
  const pending = (await kv.get(pendingKey, { type: "json" })) as PendingSubmission | null;

  if (!pending) {
    return json({ ok: false, error: "This code has expired. Please request a new one." }, 410);
  }

  // ── Stop someone from guessing the OTP by trying many codes against the same request ──
  if (pending.attempts >= MAX_OTP_ATTEMPTS) {
    await kv.delete(pendingKey);
    return json({ ok: false, error: "Too many incorrect attempts. Please request a new code." }, 429);
  }

  if (otp !== pending.otp) {
    pending.attempts += 1;
    await kv.put(pendingKey, JSON.stringify(pending), { expiration: Math.floor(Date.now() / 1000) + 600 });
    return json({ ok: false, error: "Incorrect code. Please try again." }, 401);
  }

  // ── Correct code — this email is now confirmed real. Clean up and proceed. ──
  await kv.delete(pendingKey);

  const { name, email, message } = pending;
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";

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

  // Send the real contact notification email to Ashfaq
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
      console.error("Web3Forms contact send error:", data);
    }
  } catch (err) {
    console.error("Web3Forms contact fetch error:", err);
  }

  return json({ ok: true, message: "Email verified — message sent! I will get back to you soon." });
};
