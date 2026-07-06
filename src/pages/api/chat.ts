/**
 * src/pages/api/chat.ts
 * Route: POST /api/chat
 *
 * Body: { question: string, stream?: boolean }  (stream defaults to true)
 *
 * - stream: true  (used by the chat widget) -> proxies Workers AI's SSE
 *   stream straight through to the browser, so tokens render as they
 *   arrive instead of after one long pause.
 * - stream: false (used by the eval runner) -> awaits the full answer and
 *   returns { ok, answer } as plain JSON, which is much easier to score
 *   in a test script than parsing SSE chunks.
 *
 * No per-IP rate limit here by design — removed intentionally so the demo
 * widget never blocks a real visitor mid-conversation. Workers AI's own
 * account-level free-tier daily cap is the only ceiling left; if this page
 * ever sees real bot/scraper traffic, a rate limit (same KV pattern used
 * in the contact form) is the first thing to bring back. See DECISIONS.md.
 */
import type { APIRoute } from "astro";
import { env as cfEnv } from "cloudflare:workers";
import { buildSystemPrompt } from "../../lib/chat-system-prompt";

export const prerender = false;

// Was "@cf/zai-org/glm-4.7-flash" (not a real model id), then briefly
// "@cf/meta/llama-3.1-8b-instruct" (deprecated by Cloudflare on 2026-05-30).
// Confirmed active in the Cloudflare dashboard (Workers & Pages > AI > Models)
// as of July 2026 — update here again if Cloudflare deprecates this one too.
const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const MAX_QUESTION_LENGTH = 500;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async ({ request }): Promise<Response> => {
  const ai = (cfEnv as any).AI;

  if (!ai) {
    console.error("chat.ts: AI binding missing — add [ai] binding = \"AI\" to wrangler.toml.");
    return json({ ok: false, error: "Chat is not configured on this deployment." }, 500);
  }

  let question = "";
  let stream = true;
  try {
    const body = (await request.json()) as any;
    question = (body.question ?? "").toString().trim();
    if (typeof body.stream === "boolean") stream = body.stream;
  } catch {
    return json({ ok: false, error: "Invalid request body." }, 400);
  }

  if (!question) {
    return json({ ok: false, error: "Please ask a question." }, 400);
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return json({ ok: false, error: "Question is too long." }, 422);
  }

  const messages = [
    { role: "system", content: buildSystemPrompt() },
    { role: "user", content: question },
  ];

  // ── Non-streaming path: used by the eval runner ──
  if (!stream) {
    try {
      const result = (await ai.run(MODEL, { messages, stream: false, temperature: 0 })) as any;
      // Different Workers AI models reply in different shapes:
      // - Llama-family models: a flat `.response` string
      // - GLM-4.7-flash (and other OpenAI-compatible models): nested at
      //   choices[0].message.content, same as the OpenAI chat-completion format
      // Check both so swapping MODEL later doesn't silently break this again.
      const answer = result?.choices?.[0]?.message?.content ?? result?.response ?? "";
      return json({ ok: true, answer });
    } catch (err) {
      console.error("Workers AI error:", err);
      return json({ ok: false, error: "Could not get an answer. Please try again." }, 502);
    }
  }

  // ── Streaming path: used by the chat widget ──
  try {
    const aiStream = (await ai.run(MODEL, { messages, stream: true, temperature: 0 })) as ReadableStream;
    return new Response(normalizeAiStream(aiStream), {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    console.error("Workers AI streaming error:", err);
    return json({ ok: false, error: "Could not get an answer. Please try again." }, 502);
  }
};

/**
 * Different Workers AI models stream in different shapes — Llama-family
 * models emit `data: {"response": "token"}`, while OpenAI-compatible models
 * like GLM-4.7-flash emit `data: {"choices":[{"delta":{"content":"token"}}]}`.
 *
 * Rather than make the browser-side parser (ask.astro) guess the current
 * model's format, this normalizes any of them into one consistent shape —
 * `data: {"response": "token"}` — before it ever reaches the client. If
 * MODEL changes again later, only this function needs to learn the new
 * shape; the frontend never has to change.
 */
function normalizeAiStream(source: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();

        if (payload === "[DONE]") {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          continue;
        }

        try {
          const parsed = JSON.parse(payload);
          const text: string =
            parsed?.response ??
            parsed?.choices?.[0]?.delta?.content ??
            parsed?.choices?.[0]?.message?.content ??
            "";
          if (text) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ response: text })}\n\n`));
          }
        } catch {
          // ignore partial/non-JSON lines — they'll complete on the next chunk
        }
      }
    },
    flush(controller) {
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
    },
  });

  return source.pipeThrough(transform);
}