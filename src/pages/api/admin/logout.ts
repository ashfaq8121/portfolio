import type { APIRoute } from "astro";
import { env as cfEnv } from "cloudflare:workers";

export const prerender = false;

export const POST: APIRoute = async ({ request }): Promise<Response> => {
  const kv = (cfEnv as any).RATE_LIMIT_KV;

  // Delete the session from KV too — just clearing the cookie isn't enough,
  // since someone with a copy of the old cookie value could otherwise keep
  // using it until it naturally expires 24 hours later.
  if (kv) {
    try {
      const cookie = request.headers.get("Cookie") ?? "";
      const tokenMatch = cookie.split(";").find((c) => c.trim().startsWith("admin_token="));
      const token = tokenMatch?.split("=")[1]?.trim();
      if (token) {
        await kv.delete(`admin-session:${token}`);
      }
    } catch (err) {
      console.error("Admin logout session delete error:", err);
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": "admin_token=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
    },
  });
};
