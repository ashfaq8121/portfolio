/**
 * rate-limiter-worker/src/index.ts
 *
 * A minimal, standalone Worker whose only job is to own the RateLimiter
 * Durable Object class. Deployed separately from the main Astro site.
 *
 * Why a separate Worker instead of living inside the Astro project:
 * Cloudflare requires a DO class to be exported from a Worker's actual
 * top-level entry file. Astro's Cloudflare adapter bundles API routes
 * (like contact.ts) as lazily-loaded chunks, not as part of the real
 * entry point — so a class exported from contact.ts never reaches the
 * place Cloudflare looks, and the binding silently fails to register.
 * A tiny dedicated Worker has a real, stable entry point, so this just
 * works. The main portfolio Worker binds to this one remotely via
 * `script_name` in its own wrangler.toml — see that file's comments.
 */

const MAX_REQUESTS = 3;
const WINDOW_SECONDS = 3600; // 1 hour

interface LimiterState {
  count: number;
  windowStart: number; // unix seconds
}

export class RateLimiter {
  state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const now = Math.floor(Date.now() / 1000);

    const stored = (await this.state.storage.get<LimiterState>("data")) ?? null;

    // No record yet, or the 1-hour window from the first message has
    // fully elapsed — start a fresh window at count 1 for this request.
    if (!stored || now - stored.windowStart >= WINDOW_SECONDS) {
      await this.state.storage.put("data", { count: 1, windowStart: now });
      return Response.json({ allowed: true, remaining: MAX_REQUESTS - 1 });
    }

    // Still inside the current window and at/over the limit — reject.
    if (stored.count >= MAX_REQUESTS) {
      const retryAfterSeconds = WINDOW_SECONDS - (now - stored.windowStart);
      return Response.json(
        { allowed: false, retryAfterSeconds },
        { status: 429 }
      );
    }

    // Still inside the window, under the limit — increment and allow.
    const updated: LimiterState = { count: stored.count + 1, windowStart: stored.windowStart };
    await this.state.storage.put("data", updated);
    return Response.json({ allowed: true, remaining: MAX_REQUESTS - updated.count });
  }
}

// Every Worker needs a default fetch handler, even one that's only
// ever called via a Durable Object stub from another Worker. This one
// is never actually hit in normal operation.
export default {
  async fetch(): Promise<Response> {
    return new Response("rate-limiter-worker is running.", { status: 200 });
  },
};