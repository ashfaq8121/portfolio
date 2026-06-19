import type { APIRoute } from "astro";
import { env as cfEnv } from "cloudflare:workers";

export const prerender = false;

export const POST: APIRoute = async ({ request }): Promise<Response> => {
  const kv = (cfEnv as any).RATE_LIMIT_KV;
  
  // Better IP detection
  const ip = request.headers.get("CF-Connecting-IP") 
          ?? request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() 
          ?? "unknown";

  if (kv) {
    try {
      // Delete session token
      const cookie = request.headers.get("Cookie") ?? "";
      const tokenMatch = cookie.split(";").find((c) => c.trim().startsWith("admin_token="));
      const token = tokenMatch?.split("=")[1]?.trim();
      if (token) {
        await kv.delete(`admin-session:${token}`);
      }

      // RESET rate limit so user gets fresh 5 attempts next time
      await kv.delete(`admin-login-attempts:${ip}`);
    } catch (err) {
      console.error("Logout error:", err);
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