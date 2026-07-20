/**
 * src/lib/ContactRateLimiter.ts
 *
 * One Durable Object instance per IP address (see contact.ts, which does
 * `idFromName(ip)` — the SAME ip always maps to the SAME DO instance,
 * which is what makes "3 per IP" possible: each instance has its own
 * private, durable storage that nothing else can read or write).
 *
 * Window logic ("counting starts from the 1st message, resets after 1
 * hour"): we store { count, firstMessageAt }. Every check compares "now"
 * against firstMessageAt. If more than an hour has passed since the
 * FIRST message in the current window, we treat this as a brand new
 * window (reset count to 0, restart the 1-hour clock from now) — rather
 * than a rolling/sliding average. This matches "after 1 hour reset all
 * 3" literally: it's a fixed window that restarts on first use, not a
 * continuously-sliding one.
 */

import { DurableObject } from "cloudflare:workers";

interface RateLimitState {
  count: number;
  firstMessageAt: number; // ms epoch
}

const ONE_HOUR_MS = 60 * 60 * 1000;
const MAX_MESSAGES_PER_WINDOW = 3;

// Extends the DurableObject base class from cloudflare:workers — required
// by the current Workers runtime (see the "class extends 'DurableObject'"
// requirement in the workerd startup warning). The base class's
// constructor stores `state`/`env` on `this.ctx` / `this.env` for us, so
// we call super() and then use `this.ctx.storage` below.
export class ContactRateLimiter extends DurableObject {
  // contact.ts calls this via doStub.fetch(...) — the URL/method don't
  // matter here since this DO only ever does one thing, but `fetch` is
  // the required entry point for a Durable Object.
  async fetch(_request: Request): Promise<Response> {
    const now = Date.now();

    const stored = await this.ctx.storage.get<RateLimitState>("data");
    let count = stored?.count ?? 0;
    let firstMessageAt = stored?.firstMessageAt ?? now;

    // Window expired - this message starts a fresh window/clock.
    if (now - firstMessageAt >= ONE_HOUR_MS) {
      count = 0;
      firstMessageAt = now;
    }

    if (count >= MAX_MESSAGES_PER_WINDOW) {
      const retryAfterMs = firstMessageAt + ONE_HOUR_MS - now;
      return Response.json({ allowed: false, retryAfterMs });
    }

    count += 1;
    await this.ctx.storage.put("data", { count, firstMessageAt });

    return Response.json({ allowed: true, remaining: MAX_MESSAGES_PER_WINDOW - count });
  }
}