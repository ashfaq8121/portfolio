import type { APIRoute } from "astro";

interface ContactResponse {
  ok: boolean;
  error?: string;
  errors?: Record<string, string>;
}

function json(body: ContactResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export const POST: APIRoute = async ({ request, locals }): Promise<Response> => {
  // Try every possible way to get env in Cloudflare Workers + Astro v6
  const runtime = (locals as any).runtime;
  const env = runtime?.env
    ?? runtime?.context?.env
    ?? (locals as any).env
    ?? (locals as any).cloudflare?.env
    ?? {};

  // Parse body
  let name = "", email = "", message = "";
  try {
    const ct = request.headers.get("Content-Type") ?? "";
    if (ct.includes("application/json")) {
      const b = await request.json() as any;
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

  // Validate
  const errors: Record<string, string> = {};
  if (name.trim().length < 2) errors.name = "Name must be at least 2 characters.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = "Valid email required.";
  if (message.trim().length < 10) errors.message = "Message must be at least 10 characters.";
  if (Object.keys(errors).length > 0) return json({ ok: false, errors }, 422);

  // Rate limit
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  if (env?.RATE_LIMIT_KV) {
    try {
      const key = `ratelimit:contact:${ip}`;
      const current = await env.RATE_LIMIT_KV.get(key);
      const count = current ? parseInt(current, 10) : 0;
      if (count >= 5) return json({ ok: false, error: "Too many messages. Try later." }, 429);
      await env.RATE_LIMIT_KV.put(key, String(count + 1), { expirationTtl: 3600 });
    } catch (err) {
      console.error("KV error:", err);
    }
  }

  // Get API key
  const apiKey = env?.RESEND_API_KEY;

  // Log what we have for debugging
  console.log("Env keys:", JSON.stringify(Object.keys(env ?? {})));
  console.log("Has RESEND_API_KEY:", !!apiKey);

  if (!apiKey) {
    return json({ ok: false, error: "Email service is not configured." }, 500);
  }

  const toEmail = env?.TO_EMAIL ?? "urrahmanmohammadashfaq@gmail.com";

  // Send email
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: "Portfolio Contact <onboarding@resend.dev>",
        to: [toEmail],
        reply_to: email.trim(),
        subject: `[Portfolio] Message from ${name.trim()}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;">
            <h2 style="color:#1a1a2e;">📬 New Portfolio Contact</h2>
            <p><strong>Name:</strong> ${escapeHtml(name)}</p>
            <p><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>
            <p><strong>Message:</strong></p>
            <p style="background:#f4f4f4;padding:16px;border-radius:6px;line-height:1.6;">
              ${escapeHtml(message).replace(/\n/g, "<br>")}
            </p>
          </div>
        `,
        text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
      }),
    });

    if (res.ok) return json({ ok: true });
    const errText = await res.text();
    console.error("Resend error:", errText);
    return json({ ok: false, error: "Could not send email." }, 500);
  } catch (err) {
    console.error("Fetch error:", err);
    return json({ ok: false, error: "Could not send email." }, 500);
  }
};

export const OPTIONS: APIRoute = async (): Promise<Response> =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });