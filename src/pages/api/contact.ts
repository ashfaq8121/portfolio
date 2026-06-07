import type { APIRoute } from "astro";

const WEB3FORMS_KEY = "669eaee5-ea7c-4270-840a-e1a26ed3d88c";

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

  const errors: Record<string, string> = {};
  if (name.trim().length < 2)
    errors.name = "Name must be at least 2 characters.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    errors.email = "A valid email address is required.";
  if (message.trim().length < 10)
    errors.message = "Message must be at least 10 characters.";
  if (Object.keys(errors).length > 0)
    return json({ ok: false, errors }, 422);

  try {
    const res = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_key: WEB3FORMS_KEY,
        name: name.trim(),
        email: email.trim(),
        message: message.trim(),
        subject: "[Portfolio Contact] Message from " + name.trim(),
        from_name: name.trim(),
        replyto: email.trim(),
      }),
    });

    const data = await res.json() as any;

    if (data.success) {
      return json({ ok: true, message: "Message sent! I will get back to you soon." });
    }

    console.error("Web3Forms error:", data);
    return json({ ok: false, error: "Could not send your message. Please try again." }, 500);
  } catch (err) {
    console.error("Fetch error:", err);
    return json({ ok: false, error: "Could not send your message. Please try again." }, 500);
  }
};
