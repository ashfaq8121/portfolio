/**
 * contact.test.ts — Unit tests for the contact form Worker handler
 *
 * Run:  npx vitest run
 *
 * Tests cover:
 *   - Input validation (missing fields, bad email, short message)
 *   - Rate limiting (blocks after limit, allows within limit)
 *   - Success path
 *   - Wrong HTTP method
 *   - Both JSON and FormData request bodies
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleContact, Env } from "./contact";

function makeJsonRequest(body: unknown, method = "POST"): Request {
  return new Request("https://portfolio.workers.dev/api/contact", {
    method,
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": "1.2.3.4",
    },
    body: JSON.stringify(body),
  });
}

function makeFormRequest(fields: Record<string, string>): Request {
  const form = new FormData();
  Object.entries(fields).forEach(([k, v]) => form.append(k, v));
  return new Request("https://portfolio.workers.dev/api/contact", {
    method: "POST",
    headers: { "CF-Connecting-IP": "1.2.3.4" },
    body: form,
  });
}

function makeKV(): KVNamespace {
  const store = new Map<string, { value: string; ttl?: number }>();
  return {
    async get(key: string) {
      return store.get(key)?.value ?? null;
    },
    async put(key: string, value: string, opts?: { expirationTtl?: number }) {
      store.set(key, { value, ttl: opts?.expirationTtl });
      return undefined;
    },
    async delete(key: string) {
      store.delete(key);
      return undefined;
    },
    async list() {
      return { keys: [], list_complete: true, cacheStatus: null };
    },
    async getWithMetadata() {
      return { value: null, metadata: null, cacheStatus: null };
    },
  } as unknown as KVNamespace;
}

function makeEnv(kv = makeKV()): Env {
  return {
    RATE_LIMIT_KV: kv,
    TO_EMAIL: "urrahmanmohammadashfaq@gmail.com",
    OWNER_NAME: "Ashfaq",
    RESEND_API_KEY: "re_test_key",
  };
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
  );
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("POST /api/contact — validation", () => {
  it("returns 422 when name is missing", async () => {
    const res = await handleContact(
      makeJsonRequest({ name: "", email: "test@example.com", message: "Hello there!" }),
      makeEnv()
    );
    expect(res.status).toBe(422);
    const body = await res.json<{ ok: boolean; errors: Record<string, string> }>();
    expect(body.ok).toBe(false);
    expect(body.errors.name).toBeTruthy();
  });

  it("returns 422 when email is invalid", async () => {
    const res = await handleContact(
      makeJsonRequest({ name: "Ashfaq", email: "not-an-email", message: "Hello there!" }),
      makeEnv()
    );
    expect(res.status).toBe(422);
    const body = await res.json<{ ok: boolean; errors: Record<string, string> }>();
    expect(body.errors.email).toBeTruthy();
  });

  it("returns 422 when message is too short", async () => {
    const res = await handleContact(
      makeJsonRequest({ name: "Ashfaq", email: "a@b.com", message: "Hi" }),
      makeEnv()
    );
    expect(res.status).toBe(422);
    const body = await res.json<{ ok: boolean; errors: Record<string, string> }>();
    expect(body.errors.message).toBeTruthy();
  });

  it("returns 422 with all errors when all fields are empty", async () => {
    const res = await handleContact(
      makeJsonRequest({ name: "", email: "", message: "" }),
      makeEnv()
    );
    expect(res.status).toBe(422);
    const body = await res.json<{ errors: Record<string, string> }>();
    expect(Object.keys(body.errors)).toHaveLength(3);
  });
});

describe("POST /api/contact — success path", () => {
  it("returns 200 with ok:true for a valid submission (JSON)", async () => {
    const res = await handleContact(
      makeJsonRequest({
        name: "Ashfaq",
        email: "test@example.com",
        message: "Hello, I'd love to connect!",
      }),
      makeEnv()
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean }>();
    expect(body.ok).toBe(true);
  });

  it("returns 200 with ok:true for a valid submission (FormData)", async () => {
    const res = await handleContact(
      makeFormRequest({
        name: "Ashfaq",
        email: "test@example.com",
        message: "Hello, I'd love to connect!",
      }),
      makeEnv()
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean }>();
    expect(body.ok).toBe(true);
  });

  it("calls Resend fetch with correct email fields", async () => {
    await handleContact(
      makeJsonRequest({
        name: "Ashfaq",
        email: "sender@example.com",
        message: "Reaching out about a role.",
      }),
      makeEnv()
    );

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");

    const body = JSON.parse(options?.body as string);
    expect(body.to[0]).toBe("urrahmanmohammadashfaq@gmail.com");
    expect(body.reply_to).toBe("sender@example.com");
    expect(body.subject).toContain("Ashfaq");
  });
});

describe("POST /api/contact — rate limiting", () => {
  it("allows up to 5 submissions from same IP", async () => {
    const kv = makeKV();
    const env = makeEnv(kv);
    const validPayload = {
      name: "Ashfaq",
      email: "a@b.com",
      message: "Valid message here",
    };

    for (let i = 0; i < 5; i++) {
      const res = await handleContact(makeJsonRequest(validPayload), env);
      expect(res.status).toBe(200);
    }
  });

  it("blocks the 6th submission from the same IP with 429", async () => {
    const kv = makeKV();
    const env = makeEnv(kv);
    const validPayload = {
      name: "Ashfaq",
      email: "a@b.com",
      message: "Valid message here",
    };

    for (let i = 0; i < 5; i++) {
      await handleContact(makeJsonRequest(validPayload), env);
    }

    const res = await handleContact(makeJsonRequest(validPayload), env);
    expect(res.status).toBe(429);
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/too many/i);
  });
});

describe("Wrong HTTP method", () => {
  it("returns 405 for GET requests", async () => {
    const req = new Request("https://portfolio.workers.dev/api/contact", {
      method: "GET",
    });
    const res = await handleContact(req, makeEnv());
    expect(res.status).toBe(405);
  });

  it("returns 204 for OPTIONS preflight", async () => {
    const req = new Request("https://portfolio.workers.dev/api/contact", {
      method: "OPTIONS",
    });
    const res = await handleContact(req, makeEnv());
    expect(res.status).toBe(204);
  });
});

describe("Email failure handling", () => {
  it("returns 500 when Resend is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 500 }))
    );

    const res = await handleContact(
      makeJsonRequest({
        name: "Ashfaq",
        email: "a@b.com",
        message: "Valid message here",
      }),
      makeEnv()
    );

    expect(res.status).toBe(500);
    const body = await res.json<{ ok: boolean }>();
    expect(body.ok).toBe(false);
  });
});