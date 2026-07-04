import type { APIRoute } from "astro";

export const prerender = false;

const SESSION_TTL_SECONDS = 86400;
const LOGIN_RATE_LIMIT = 5;
const LOGIN_RATE_WINDOW_SECONDS = 3600;

interface LoginAttemptData {
  count: number;
  expiresAt: number;
}

function generateSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const POST: APIRoute = async ({ request }): Promise<Response> => {
  const { env } = await import("cloudflare:workers");
  
  const adminPassword = env.ADMIN_PASSWORD;
  const kv = env.RATE_LIMIT_KV;

  const ip = request.headers.get("CF-Connecting-IP") 
          ?? request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() 
          ?? "unknown";

  // ── STEP 1: Check if already locked out ──
  if (kv) {
    try {
      const key = `admin-login-attempts:${ip}`;
      const now = Math.floor(Date.now() / 1000);
      const stored = (await kv.get(key, { type: "json" })) as LoginAttemptData | null;

      if (stored && now < stored.expiresAt && stored.count >= LOGIN_RATE_LIMIT) {
        const minutesLeft = Math.ceil((stored.expiresAt - now) / 60);
        return new Response(
          JSON.stringify({ 
            ok: false, 
            error: `Too many attempts. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.` 
          }),
          { status: 429, headers: { "Content-Type": "application/json" } }
        );
      }
    } catch (err) {
      console.error("Rate-limit read error:", err);
    }
  }

  // ── STEP 2: Parse password ──
  let password = "";
  try {
    const body = (await request.json()) as any;
    password = body.password ?? "";
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid body." }), { status: 400 });
  }

  // ── STEP 3: Check password ──
  if (!adminPassword || password !== adminPassword) {
    if (kv) {
      try {
        const key = `admin-login-attempts:${ip}`;
        const now = Math.floor(Date.now() / 1000);
        const stored = (await kv.get(key, { type: "json" })) as LoginAttemptData | null;

        const updated: LoginAttemptData =
          !stored || now >= stored.expiresAt
            ? { count: 1, expiresAt: now + LOGIN_RATE_WINDOW_SECONDS }
            : { count: stored.count + 1, expiresAt: stored.expiresAt };

        await kv.put(key, JSON.stringify(updated), { expiration: updated.expiresAt });
      } catch (err) {
        console.error("Rate-limit write error:", err);
      }
    }
    return new Response(JSON.stringify({ ok: false, error: "Wrong password." }), { status: 401 });
  }

  // ── STEP 4: CORRECT PASSWORD → RESET attempts and create session ──
  if (kv) {
    try {
      await kv.delete(`admin-login-attempts:${ip}`);
    } catch (err) {
      console.error("Rate-limit reset error:", err);
    }
  }

  const sessionToken = generateSessionToken();

  if (kv) {
    try {
      await kv.put(`admin-session:${sessionToken}`, "1", {
        expiration: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
      });
    } catch (err) {
      console.error("Session store error:", err);
      return new Response(
        JSON.stringify({ ok: false, error: "Could not start session." }),
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