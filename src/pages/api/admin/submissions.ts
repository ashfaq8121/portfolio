import type { APIRoute } from "astro";
import { env as cfEnv } from "cloudflare:workers";

export const prerender = false;

async function isAuthed(request: Request, kv: any): Promise<boolean> {
  if (!kv) return false;

  const cookie = request.headers.get("Cookie") ?? "";
  const tokenMatch = cookie.split(";").find((c) => c.trim().startsWith("admin_token="));
  const token = tokenMatch?.split("=")[1]?.trim();
  if (!token) return false;

  try {
    const session = await kv.get(`admin-session:${token}`);
    return session !== null;
  } catch (err) {
    console.error("Admin session check error:", err);
    return false;
  }
}

export const GET: APIRoute = async ({ request }): Promise<Response> => {
  const kv = (cfEnv as any).RATE_LIMIT_KV;
  const db = (cfEnv as any).DB;

  if (!(await isAuthed(request, kv))) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized." }), { status: 401 });
  }

  // Convert UTC to IST (+5:30) in SQL query
  const { results } = await db.prepare(
    `SELECT 
      id, 
      name, 
      email, 
      message, 
      ip, 
      datetime(submitted_at, '+5 hours', '+30 minutes') as submitted_at 
    FROM contact_submissions 
    WHERE is_deleted = 0 
    ORDER BY submitted_at DESC`
  ).all();

  return new Response(JSON.stringify({ ok: true, data: results }), {
    headers: { "Content-Type": "application/json" },
  });
};

export const DELETE: APIRoute = async ({ request, url }): Promise<Response> => {
  const kv = (cfEnv as any).RATE_LIMIT_KV;
  const db = (cfEnv as any).DB;

  if (!(await isAuthed(request, kv))) {
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