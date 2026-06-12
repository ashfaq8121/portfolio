import type { APIRoute } from "astro";
import { env as cfEnv } from "cloudflare:workers";

export const prerender = false;

function isAuthed(request: Request, adminPassword: string): boolean {
  const cookie = request.headers.get("Cookie") ?? "";
  const token = cookie.split(";").find(c => c.trim().startsWith("admin_token="));
  return token?.split("=")[1]?.trim() === adminPassword;
}

export const GET: APIRoute = async ({ request }): Promise<Response> => {
  const adminPassword = (cfEnv as any).ADMIN_PASSWORD;
  const db = (cfEnv as any).DB;

  if (!adminPassword || !isAuthed(request, adminPassword)) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized." }), { status: 401 });
  }

  const { results } = await db.prepare(
    `SELECT id, name, email, message, ip, submitted_at FROM contact_submissions WHERE is_deleted = 0 ORDER BY submitted_at DESC`
  ).all();

  return new Response(JSON.stringify({ ok: true, data: results }), {
    headers: { "Content-Type": "application/json" },
  });
};

export const DELETE: APIRoute = async ({ request, url }): Promise<Response> => {
  const adminPassword = (cfEnv as any).ADMIN_PASSWORD;
  const db = (cfEnv as any).DB;

  if (!adminPassword || !isAuthed(request, adminPassword)) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized." }), { status: 401 });
  }

  const id = url.searchParams.get("id");
  if (!id) return new Response(JSON.stringify({ ok: false, error: "Missing id." }), { status: 400 });

  await db.prepare(
    `UPDATE contact_submissions SET is_deleted = 1 WHERE id = ?`
  ).bind(id).run();

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
};