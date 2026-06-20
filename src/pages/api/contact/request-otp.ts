/**
 * src/pages/api/contact/request-otp.ts
 * Route: POST /api/contact/request-otp
 *
 * Body: { email }
 * - If this browser already verified this email (signed cookie), responds
 *   { ok: true, alreadyVerified: true } and sends no OTP.
 * - Otherwise generates a fresh 6-digit OTP (valid 2 minutes), stores a
 *   SHA-256 hash of it in KV, and emails it via Resend.
 * - Resending is unlimited, but wrong-attempt lockout (3 strikes / 1hr,
 *   tracked in verify-otp.ts) still applies and blocks new sends too.
 */
import type { APIRoute } from "astro";
import { env as cfEnv } from "cloudflare:workers";
import {
  generateOtp,
  sha256Hex,
  readVerifiedEmails,
  OTP_TTL_SECONDS,
  OTP_MAX_ATTEMPTS,
} from "../../../lib/otp";

export const prerender = false;

const GMAIL_RE = /^[^\s@]+@gmail\.com$/i;

interface AttemptsData {
  count: number;
  lockedUntil: number | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async ({ request }): Promise<Response> => {
  const kv = (cfEnv as any).RATE_LIMIT_KV;
  const secret = (cfEnv as any).OTP_SIGNING_SECRET;
  const resendKey = (cfEnv as any).RESEND_API_KEY;

  if (!kv || !secret || !resendKey) {
    console.error("OTP route missing config (KV / OTP_SIGNING_SECRET / RESEND_API_KEY).");
    return json({ ok: false, error: "Server not configured." }, 500);
  }

  let email = "";
  try {
    const body = (await request.json()) as any;
    email = (body.email ?? "").trim().toLowerCase();
  } catch {
    return json({ ok: false, error: "Invalid request body." }, 400);
  }

  if (!email || !GMAIL_RE.test(email)) {
    return json({ ok: false, error: "Please enter a valid Gmail address." }, 422);
  }

  // ── Already verified on this browser? Skip OTP entirely. ──
  const cookieHeader = request.headers.get("Cookie") ?? "";
  const verifiedEmails = await readVerifiedEmails(cookieHeader, secret);
  if (verifiedEmails.includes(email)) {
    return json({ ok: true, alreadyVerified: true });
  }

  const now = Math.floor(Date.now() / 1000);
  const attemptsKey = `otp-attempts:${email}`;

  // ── Locked out from too many wrong attempts? Block new sends too. ──
  try {
    const attemptsData = (await kv.get(attemptsKey, { type: "json" })) as AttemptsData | null;
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

  // ── Generate + store a fresh OTP (overwrites any previous one for this email) ──
  const code = generateOtp();
  const codeHash = await sha256Hex(code);
  const expiresAt = now + OTP_TTL_SECONDS;

  try {
    await kv.put(`otp-code:${email}`, JSON.stringify({ codeHash, expiresAt }), {
      expiration: expiresAt + 5,
    });
  } catch (err) {
    console.error("OTP store error:", err);
    return json({ ok: false, error: "Could not generate a code. Please try again." }, 500);
  }

  // ── Send the OTP via Resend ──
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Portfolio Contact <onboarding@resend.dev>",
        to: [email],
        subject: `Your verification code is ${code}`,
        html: `<p>Your verification code is <strong style="font-size:18px">${code}</strong>.</p><p>It expires in 2 minutes. If you didn't request this, you can ignore this email.</p>`,
      }),
    });

    if (!res.ok) {
      console.error("Resend error:", await res.text());
      return json({ ok: false, error: "Could not send the code. Please try again." }, 502);
    }
  } catch (err) {
    console.error("Resend fetch error:", err);
    return json({ ok: false, error: "Could not send the code. Please try again." }, 502);
  }

  return json({
    ok: true,
    expiresInSeconds: OTP_TTL_SECONDS,
    maxAttempts: OTP_MAX_ATTEMPTS,
  });
};
