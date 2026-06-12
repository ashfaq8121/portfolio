import type { APIRoute } from "astro";
import { env as cfEnv } from "cloudflare:workers";

export const prerender = false;

export const POST: APIRoute = async ({ request }): Promise<Response> => {
  const adminPassword = (cfEnv as any).ADMIN_PASSWORD;
  let password = "";
  try {
    const body = (await request.json()) as any;
    password = body.password ?? "";
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid body." }), { status: 400 });
  }

  if (!adminPassword || password !== adminPassword) {
    return new Response(JSON.stringify({ ok: false, error: "Wrong password." }), { status: 401 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `admin_token=${adminPassword}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`,
    },
  });
};