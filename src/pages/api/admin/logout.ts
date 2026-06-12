import type { APIRoute } from "astro";

export const prerender = false;

export const POST: APIRoute = async (): Promise<Response> => {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": "admin_token=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
    },
  });
};