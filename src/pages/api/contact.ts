import type { APIRoute } from "astro";
import { env as cfEnv } from "cloudflare:workers";

interface ContactResponse {
  ok: boolean;
  error?: string;
  errors?: Record<string, string>;
  message?: string;
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
  email = stripHtml(email);
  message = stripHtml(message);

  const errors: Record<string, string> = {};
  if (!name) errors.name = "Name is required.";
  else if (name.length < 2) errors.name = "Name must be at least 2 characters.";
  else if (name.length > 100) errors.name = "Name must be 100 characters or fewer.";

  if (!email) errors.email = "Email is required.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = "Please enter a valid email address.";
  else if (email.length > 254) errors.email = "Email address is too long.";

  if (!message) errors.message = "Message is required.";
  else if (message.length < 10) errors.message = "Message must be at least 10 characters.";
  else if (message.length > 4000) errors.message = "Message must be 4,000 characters or fewer.";

  if (Object.keys(errors).length > 0) return json({ ok: false, errors }, 422);

  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";

  // Save to D1
  const db = (cfEnv as any).DB;
  if (db) {
    try {
      await db.prepare(
        `INSERT INTO contact_submissions (name, email, message, ip) VALUES (?, ?, ?, ?)`
      ).bind(name, email, message, ip).run();
    } catch (err) {
      console.error("D1 save error:", err);
    }
  }

  return json({ ok: true, message: "Message sent! I will get back to you soon." });
};