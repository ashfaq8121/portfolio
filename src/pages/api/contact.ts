import type { APIRoute } from "astro";

// ── Types ───────────────────────────────────────────────────────────

interface ContactFormData {
  name: string;
  email: string;
  message: string;
}

interface ContactResponse {
  ok: boolean;
  error?: string;
  errors?: Record<string, string>;
}

// ── Helpers ───────────────────────────────────────────────────────────

function json(body: ContactResponse, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── POST Handler ──────────────────────────────────────────────────────

export const POST: APIRoute = async ({ request, locals }): Promise<Response> => {
  // ✅ Access env through locals with type assertion (avoids TS error)
  const env = (locals as any).env ?? {};

  // ── Parse body ─────────────────────────────────────────────────────
  let name = "";
  let email = "";
  let message = "";

  try {
    const contentType = request.headers.get("Content-Type") ?? "";
    if (contentType.includes("application/json")) {
      const body = await request.json() as ContactFormData;  // ✅ FIXED: No Partial, no <<
      name = body.name ?? "";
      email = body.email ?? "";
      message = body.message ?? "";
    } else {
      const formData = await request.formData();
      name = formData.get("name")?.toString() ?? "";
      email = formData.get("email")?.toString() ?? "";
      message = formData.get("message")?.toString() ?? "";
    }
  } catch {
    return json({ ok: false, error: "Invalid request body." }, 400);
  }

  // ── Validate ───────────────────────────────────────────────────────
  const errors: Record<string, string> = {};

  if (name.trim().length < 2) {
    errors.name = "Name must be at least 2 characters.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    errors.email = "Please enter a valid email address.";
  }
  if (message.trim().length < 10) {
    errors.message = "Message must be at least 10 characters.";
  }
  if (Object.keys(errors).length > 0) {
    return json({ ok: false, errors }, 422);
  }

  // ── Rate limit ─────────────────────────────────────────────────────
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  if (env.RATE_LIMIT_KV) {
    try {
      const key = `ratelimit:contact:${ip}`;
      const current = await env.RATE_LIMIT_KV.get(key);
      const count = current ? parseInt(current, 10) : 0;

      if (count >= 5) {
        return json(
          { ok: false, error: "Too many messages. Please try again later." },
          429
        );
      }

      await env.RATE_LIMIT_KV.put(key, String(count + 1), {
        expirationTtl: 3600,
      });
    } catch (err) {
      console.error("Rate limit KV error:", err);
    }
  }

  // ── Send email via Resend ──────────────────────────────────────────
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY not configured. env:", env);
    return json(
      { ok: false, error: "Email service is not configured." },
      500
    );
  }

  const toEmail = env.TO_EMAIL ?? "urrahmanmohammadashfaq@gmail.com";

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
        html: `<p><strong>Name:</strong> ${escapeHtml(name)}</p>
               <p><strong>Email:</strong> ${escapeHtml(email)}</p>
               <p><strong>Message:</strong><br>${escapeHtml(message).replace(/\n/g, "<br>")}</p>`,
        text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
      }),
    });

    if (res.ok) {
      return json({ ok: true });
    }

    const errorText = await res.text();
    console.error("Resend API error:", res.status, errorText);
    return json({ ok: false, error: "Failed to send email. Please try again." }, 500);
  } catch (err) {
    console.error("Email send exception:", err);
    return json({ ok: false, error: "Failed to send email. Please try again." }, 500);
  }
};

// ── OPTIONS Handler ───────────────────────────────────────────────────

export const OPTIONS: APIRoute = async (): Promise<Response> =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });

// ── Utility ─────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}