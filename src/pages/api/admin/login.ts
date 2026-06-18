import type { APIRoute } from "astro";
import { env as cfEnv } from "cloudflare:workers";

export const prerender = false;

const SESSION_TTL_SECONDS = 86400; // 24 hours
const LOGIN_RATE_LIMIT = 5;        // max 5 attempts
const LOGIN_RATE_WINDOW_SECONDS = 900; // per 15 minutes

interface LoginAttemptData {
  count: number;
  expiresAt: number;
}

// Generates a random, unguessable token — this is what gets stored in the
// cookie, never the real password. Even if this token leaks, it can be
// revoked instantly (see logout.ts) and never reveals the actual password.
function generateSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const POST: APIRoute = async ({ request }): Promise<Response> => {
  const adminPassword = (cfEnv as any).ADMIN_PASSWORD;
  const kv = (cfEnv as any).RATE_LIMIT_KV;
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";

  // ── Rate limit login attempts per IP — prevents brute-forcing the password ──
  if (kv) {
    try {
      const key = `admin-login-attempts:${ip}`;
      const now = Math.floor(Date.now() / 1000);
      const stored = (await kv.get(key, { type: "json" })) as LoginAttemptData | null;

      if (stored && now < stored.expiresAt && stored.count >= LOGIN_RATE_LIMIT) {
        return new Response(
          JSON.stringify({ ok: false, error: "Too many attempts. Please try again later." }),
          { status: 429, headers: { "Content-Type": "application/json" } }
        );
      }

      const updated: LoginAttemptData =
        !stored || now >= stored.expiresAt
          ? { count: 1, expiresAt: now + LOGIN_RATE_WINDOW_SECONDS }
          : { count: stored.count + 1, expiresAt: stored.expiresAt };

      await kv.put(key, JSON.stringify(updated), { expiration: updated.expiresAt });
    } catch (err) {
      console.error("Admin login rate-limit error:", err);
    }
  }

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

  // ── Password is correct — issue a random session token, not the password itself ──
  const sessionToken = generateSessionToken();

  if (kv) {
    try {
      await kv.put(`admin-session:${sessionToken}`, "1", {
        expiration: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
      });
    } catch (err) {
      console.error("Admin session store error:", err);
      return new Response(
        JSON.stringify({ ok: false, error: "Could not start session. Please try again." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `admin_token=${sessionToken}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_SECONDS}`,
    },
  });
};
