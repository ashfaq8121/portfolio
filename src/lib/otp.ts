/**
 * src/lib/otp.ts
 *
 * Shared helpers for the contact-form OTP flow:
 *  - generating/hashing 6-digit codes
 *  - signing & reading the "verified email" cookie (HMAC-SHA256, browser-bound)
 *
 * No Cloudflare-specific APIs beyond Web Crypto (available in Workers runtime).
 */

export const OTP_TTL_SECONDS = 120;            // OTP is valid for 2 minutes
export const OTP_MAX_ATTEMPTS = 3;             // 3 wrong tries -> lockout
export const OTP_LOCKOUT_SECONDS = 3600;       // lockout lasts 1 hour
export const VERIFIED_COOKIE_NAME = "contact_verified";
export const VERIFIED_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // remember for 30 days

// ─── OTP generation / hashing ────────────────────────────────────────────────

export function generateOtp(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const n = new DataView(bytes.buffer).getUint32(0) % 1_000_000;
  return n.toString().padStart(6, "0");
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── HMAC signing ─────────────────────────────────────────────────────────────

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function signPayload(secret: string, payload: string): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifySignature(secret: string, payload: string, signature: string): Promise<boolean> {
  const expected = await signPayload(secret, payload);
  if (expected.length !== signature.length) return false;
  // constant-time-ish compare
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

// ─── Verified-email cookie (signed, HttpOnly) ────────────────────────────────

interface VerifiedCookiePayload {
  emails: string[];
  exp: number; // unix seconds
}

function b64urlEncode(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str: string): string {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  return atob(str.replace(/-/g, "+").replace(/_/g, "/") + pad);
}

/** Returns the list of emails verified on this browser (empty array if none/invalid/expired). */
export async function readVerifiedEmails(cookieHeader: string, secret: string): Promise<string[]> {
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${VERIFIED_COOKIE_NAME}=`));
  if (!match) return [];

  const value = match.slice(VERIFIED_COOKIE_NAME.length + 1);
  const dot = value.indexOf(".");
  if (dot === -1) return [];
  const payloadB64 = value.slice(0, dot);
  const signature = value.slice(dot + 1);

  try {
    const valid = await verifySignature(secret, payloadB64, signature);
    if (!valid) return [];
    const payload = JSON.parse(b64urlDecode(payloadB64)) as VerifiedCookiePayload;
    if (!payload.exp || Math.floor(Date.now() / 1000) >= payload.exp) return [];
    return Array.isArray(payload.emails) ? payload.emails : [];
  } catch {
    return [];
  }
}

/** Builds a full Set-Cookie header value adding `newEmail` to the verified list. */
export async function buildVerifiedCookie(
  existingEmails: string[],
  newEmail: string,
  secret: string
): Promise<string> {
  const emails = Array.from(new Set([...existingEmails, newEmail.toLowerCase()]));
  const exp = Math.floor(Date.now() / 1000) + VERIFIED_COOKIE_MAX_AGE;
  const payload: VerifiedCookiePayload = { emails, exp };
  const payloadB64 = b64urlEncode(JSON.stringify(payload));
  const signature = await signPayload(secret, payloadB64);
  return `${VERIFIED_COOKIE_NAME}=${payloadB64}.${signature}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${VERIFIED_COOKIE_MAX_AGE}`;
}
