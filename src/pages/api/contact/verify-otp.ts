/**
 * src/pages/api/contact/verify-otp.ts
 * Route: POST /api/contact/verify-otp
 *
 * Body: { email, otp }
 * - Wrong code: bumps a per-email attempt counter. 3rd wrong attempt
 *   locks that email out for 1 hour (also blocks new OTP sends).
 * - Correct code: clears counters and sets a signed, HttpOnly cookie
 *   marking this email verified on this browser (so re-entering the
 *   same email later skips OTP, until the cookie expires/is cleared).
 */
import type { APIRoute } from "astro";
import { env as cfEnv } from "cloudflare:workers";
import {
  sha256Hex,
  readVerifiedEmails,
  buildVerifiedCookie,
  OTP_MAX_ATTEMPTS,
  OTP_LOCKOUT_SECONDS,
} from "../../../lib/otp";

export const prerender = false;

interface AttemptsData {
  count: number;
  lockedUntil: number | null;
}

interface CodeData {
  codeHash: string;
  expiresAt: number;
}

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

export const POST: APIRoute = async ({ request }): Promise<Response> => {
  const kv = (cfEnv as any).RATE_LIMIT_KV;
  const secret = (cfEnv as any).OTP_SIGNING_SECRET;

  if (!kv || !secret) {
    console.error("verify-otp missing config (KV / OTP_SIGNING_SECRET).");
    return json({ ok: false, error: "Server not configured." }, 500);
  }

  let email = "";
  let otp = "";
  try {
    const body = (await request.json()) as any;
    email = (body.email ?? "").trim().toLowerCase();
    otp = (body.otp ?? "").trim();
  } catch {
    return json({ ok: false, error: "Invalid request body." }, 400);
  }

  if (!email || !otp) {
    return json({ ok: false, error: "Email and code are required." }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const attemptsKey = `otp-attempts:${email}`;
  const codeKey = `otp-code:${email}`;

  // ── Already locked out? ──
  let attemptsData: AttemptsData | null = null;
  try {
    attemptsData = (await kv.get(attemptsKey, { type: "json" })) as AttemptsData | null;
    if (attemptsData?.lockedUntil && now < attemptsData.lockedUntil) {
      const minutesLeft = Math.ceil((attemptsData.lockedUntil - now) / 60);
      return json(
        {
          ok: false,
          error: `Too many wrong attempts. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? "s" : ""}.`,
          lockedOut: true,
        },
        429
      );
    }
  } catch (err) {
    console.error("OTP attempts read error:", err);
  }

  // ── Look up the active OTP ──
  let stored: CodeData | null = null;
  try {
    stored = (await kv.get(codeKey, { type: "json" })) as CodeData | null;
  } catch (err) {
    console.error("OTP read error:", err);
  }

  if (!stored || now >= stored.expiresAt) {
    return json({ ok: false, error: "That code expired. Please request a new one.", expired: true }, 410);
  }

  const otpHash = await sha256Hex(otp);

  if (otpHash !== stored.codeHash) {
    // ── Wrong code: bump the attempt counter ──
    const newCount = (attemptsData?.count ?? 0) + 1;
    const lockedOut = newCount >= OTP_MAX_ATTEMPTS;
    const updated: AttemptsData = {
      count: newCount,
      lockedUntil: lockedOut ? now + OTP_LOCKOUT_SECONDS : null,
    };

    try {
      await kv.put(attemptsKey, JSON.stringify(updated), { expiration: now + OTP_LOCKOUT_SECONDS });
    } catch (err) {
      console.error("OTP attempts write error:", err);
    }

    if (lockedOut) {
      try {
        await kv.delete(codeKey);
      } catch {
        /* ignore */
      }
      return json(
        { ok: false, error: "Too many wrong attempts. Try again in 1 hour.", lockedOut: true },
        429
      );
    }

    const attemptsLeft = OTP_MAX_ATTEMPTS - newCount;
    return json(
      {
        ok: false,
        error: `Incorrect code. ${attemptsLeft} attempt${attemptsLeft !== 1 ? "s" : ""} left.`,
        attemptsLeft,
      },
      401
    );
  }

  // ── Correct code: clean up, mark email verified for this browser ──
  try {
    await kv.delete(codeKey);
    await kv.delete(attemptsKey);
  } catch (err) {
    console.error("OTP cleanup error:", err);
  }

  const cookieHeader = request.headers.get("Cookie") ?? "";
  const existingEmails = await readVerifiedEmails(cookieHeader, secret);
  const cookie = await buildVerifiedCookie(existingEmails, email, secret);

  return json({ ok: true }, 200, { "Set-Cookie": cookie });
};
