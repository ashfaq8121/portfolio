/**
 * src/durable-objects/ContactRateLimiter.mjs
 *
 * Plain JS (not TS) on purpose: this file gets copied verbatim into
 * dist/server/ by scripts/postbuild-durable-object.mjs after every
 * `astro build`, because @astrojs/cloudflare@13.6.1 has no built-in way
 * to bundle a custom Durable Object class into its generated Worker
 * entry. If you change the rate-limit logic, edit THIS file.
 *
 * One Durable Object *instance* per IP address (contact.ts calls
 * idFromName(ip)), so each instance only ever tracks a single IP's
 * request history — no shared state, no race conditions between
 * different visitors, and concurrent hits from the SAME IP are safely
 * serialized because a DO instance processes one request at a time.
 *
 * Behavior: 3 messages allowed per IP per rolling 1-hour window. The
 * window starts on the FIRST message in a fresh window (not a fixed
 * clock hour) — e.g. first message at 2:15pm resets the limit at
 * 3:15pm, not 3:00pm. The 4th attempt inside that hour is blocked with
 * the remaining wait time.
 */

const WINDOW_SECONDS = 3600; // 1 hour
const MAX_MESSAGES_PER_WINDOW = 3;

export class ContactRateLimiter {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const now = Math.floor(Date.now() / 1000);
    const stored = (await this.state.storage.get("rl")) ?? null;

    // No prior record, or the previous window fully expired: this
    // request becomes the FIRST message of a brand new window.
    const windowExpired = !stored || now - stored.windowStart >= WINDOW_SECONDS;

    if (windowExpired) {
      await this.state.storage.put("rl", { count: 1, windowStart: now });
      return new Response(
        JSON.stringify({ allowed: true }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Still inside an active window.
    if (stored.count >= MAX_MESSAGES_PER_WINDOW) {
      const retryAfterSeconds = WINDOW_SECONDS - (now - stored.windowStart);
      return new Response(
        JSON.stringify({ allowed: false, retryAfterSeconds }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Under the limit — record this hit, window start stays the same.
    await this.state.storage.put("rl", {
      count: stored.count + 1,
      windowStart: stored.windowStart,
    });

    return new Response(
      JSON.stringify({ allowed: true }),
      { headers: { "Content-Type": "application/json" } }
    );
  }
}
