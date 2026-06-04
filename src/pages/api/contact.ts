import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals as any).runtime?.env;

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  // Parse body
  let name = "", email = "", message = "";
  try {
    const ct = request.headers.get("Content-Type") ?? "";
    if (ct.includes("application/json")) {
      const b = await request.json() as any;
      name = b.name ?? ""; email = b.email ?? ""; message = b.message ?? "";
    } else {
      const f = await request.formData();
      name = f.get("name")?.toString() ?? "";
      email = f.get("email")?.toString() ?? "";
      message = f.get("message")?.toString() ?? "";
    }
  } catch {
    return json({ ok: false, error: "Invalid request." }, 400);
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
    const key = `ratelimit:${ip}`;
    const count = parseInt((await env.RATE_LIMIT_KV.get(key)) ?? "0", 10);
    if (count >= 5) return json({ ok: false, error: "Too many messages. Try later." }, 429);
    await env.RATE_LIMIT_KV.put(key, String(count + 1), { expirationTtl: 3600 });
  }

  // Send email
  const apiKey = env?.RESEND_API_KEY;
  if (!apiKey) return json({ ok: false, error: "Email not configured." }, 500);

  const toEmail = env?.TO_EMAIL ?? "urrahmanmohammadashfaq@gmail.com";

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
      html: `<p><b>Name:</b> ${name}</p><p><b>Email:</b> ${email}</p><p><b>Message:</b><br>${message.replace(/\n/g, "<br>")}</p>`,
      text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
    }),
  });

  if (res.ok) return json({ ok: true });
  const err = await res.text();
  console.error("Resend error:", err);
  return json({ ok: false, error: "Could not send email." }, 500);
};

export const OPTIONS: APIRoute = async () =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });