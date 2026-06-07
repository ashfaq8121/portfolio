/**
 * worker/api/contact.ts
 * Standalone Cloudflare Worker handler (used by tests)
 */

export interface Env {
  RATE_LIMIT_KV: KVNamespace;
  DB?: D1Database;
  TO_EMAIL: string;
  OWNER_NAME: string;
  RESEND_API_KEY: string;
}

const WEB3FORMS_KEY = "669eaee5-ea7c-4270-840a-e1a26ed3d88c";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function validate(raw: any) {
  const errors: Record<string, string> = {};
  const name = (raw.name ?? "").trim();
  const email = (raw.email ?? "").trim();
  const message = (raw.message ?? "").trim();
  if (name.length < 2) errors.name = "Name must be at least 2 characters.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "A valid email address is required.";
  if (message.length < 10) errors.message = "Message must be at least 10 characters.";
  return { ok: Object.keys(errors).length === 0, errors, name, email, message };
}

export async function handleContact(request: Request, env: Env): Promise<Response> {
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

  let raw: any = {};
  try {
    const ct = request.headers.get("Content-Type") ?? "";
    if (ct.includes("application/json")) {
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

  const { ok, errors, name, email, message } = validate(raw);
  if (!ok) return json({ ok: false, errors }, 422);

  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  if (env.RATE_LIMIT_KV) {
    try {
      const key = `ratelimit:${ip}`;
      const current = await env.RATE_LIMIT_KV.get(key);
      const count = current ? parseInt(current, 10) : 0;
      if (count >= 5) return json({ ok: false, error: "Too many messages. Please try again later." }, 429);
      await env.RATE_LIMIT_KV.put(key, String(count + 1), { expirationTtl: 3600 });
    } catch (err) {
      console.error("KV error:", err);
    }
  }

  const res = await fetch("https://api.web3forms.com/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      access_key: WEB3FORMS_KEY,
      name,
      email,
      message,
      subject: `[Portfolio Contact] Message from ${name}`,
      replyto: email,
    }),
  });

  const data = await res.json() as any;
  if (data.success) return json({ ok: true, message: "Message sent!" });
  return json({ ok: false, error: "Could not send your message. Please try again." }, 500);
}