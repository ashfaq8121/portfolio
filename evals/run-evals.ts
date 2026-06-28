/**
 * evals/run-evals.ts
 *
 * Standalone script — deliberately NOT part of the regular `npm run test`
 * Vitest suite that gates PRs (see DECISIONS.md for why). Run with:
 *   npm run evals
 *
 * Env vars (auto-loaded from .dev.vars if present — see below):
 *   CHAT_ENDPOINT          base URL of the site to test, e.g.
 *                          http://localhost:4321 (wrangler dev) or your
 *                          deployed branch preview URL. Defaults to localhost.
 *   CLOUDFLARE_API_TOKEN   needed only for "model-graded" cases (calls
 *                          Workers AI directly to grade an open-ended answer).
 *   CLOUDFLARE_ACCOUNT_ID  same — your Cloudflare account ID.
 *
 * If the Cloudflare grading vars aren't set, model-graded cases are
 * reported as SKIPPED rather than failed, so the rest of the suite still
 * runs and a missing secret doesn't look like a regression.
 *
 * These two values are loaded automatically from .dev.vars (the same
 * gitignored local-secrets file Wrangler already uses), so you don't have
 * to set them with $env: in every fresh terminal — just add these two
 * lines to .dev.vars once:
 *   CLOUDFLARE_API_TOKEN=your-token-here
 *   CLOUDFLARE_ACCOUNT_ID=your-account-id-here
 * A real $env: value, if already set, always takes priority over .dev.vars.
 */
import { writeFileSync, existsSync, readFileSync } from "fs";
import { EVAL_CASES, type EvalCase } from "./cases";

// ── Load CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID from .dev.vars ────────
// (only fills in values that aren't already set in the real environment)
function loadDevVars(): void {
  if (!existsSync(".dev.vars")) return;
  const lines = readFileSync(".dev.vars", "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadDevVars();
// ─────────────────────────────────────────────────────────────────────────

const CHAT_ENDPOINT = process.env.CHAT_ENDPOINT ?? "http://localhost:4321";
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
// Must match MODEL in src/pages/api/chat.ts — keep these two in sync.
const GRADING_MODEL = "@cf/zai-org/glm-4.7-flash";

interface CaseResult {
  id: string;
  question: string;
  answer: string;
  pass: boolean | "skipped";
  reason: string;
}

function countSentences(text: string): number {
  // A naive split on every ".", "!", "?" badly overcounts résumé-style text:
  // "CGPA of 7.97." and "B.Tech" each contain a period that ISN'T a real
  // sentence boundary. Real sentence-ending punctuation is always followed
  // by whitespace (or end of string) — "7.97" and "B.Tech" have no space
  // right after their internal period, so requiring that distinguishes them.
  // Decimal numbers get an extra pass: strip the internal "."  (7.97 -> 797)
  // before counting, since digit.digit periods are never sentence boundaries.
  const withoutDecimals = text.replace(/(\d)\.(\d)/g, "$1$2");
  const enders = withoutDecimals.match(/[.!?]+(?=\s|$)/g) ?? [];
  return Math.max(enders.length, 1);
}

function toList(expected: string | string[] | undefined): string[] {
  if (!expected) return [];
  return Array.isArray(expected) ? expected : [expected];
}

async function gradeWithAI(rubric: string, answer: string): Promise<{ pass: boolean; reason: string }> {
  const gradingPrompt = `You are grading a chatbot's answer against a rubric. Reply with exactly
one word first: PASS or FAIL, then a short reason on the next line.

RUBRIC: ${rubric}

ANSWER TO GRADE: """${answer}"""`;

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${GRADING_MODEL}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages: [{ role: "user", content: gradingPrompt }] }),
    }
  );
  const data = (await res.json()) as any;
  // Same two possible shapes as chat.ts: Llama-family models reply with a
  // flat .response field; GLM-4.7-flash (OpenAI-compatible) nests it at
  // result.choices[0].message.content. Check both.
  const text: string = data?.result?.choices?.[0]?.message?.content ?? data?.result?.response ?? "";
  const pass = /^\s*pass/i.test(text);
  return { pass, reason: text.trim().slice(0, 220) || `(empty grading response — raw: ${JSON.stringify(data).slice(0, 200)})` };
}

/** Runs the single check defined on a case against the answer it got back. */
async function checkAnswer(c: EvalCase, answer: string): Promise<{ pass: boolean | "skipped"; reason: string }> {
  switch (c.check) {
    case "contains": {
      const candidates = toList(c.expected);
      const lower = answer.toLowerCase();
      const pass = candidates.every((s) => lower.includes(s.toLowerCase()));
      return { pass, reason: pass ? "ok" : `expected to contain: ${candidates.join(", ")}` };
    }
    case "not-contains": {
      const candidates = toList(c.expected);
      const lower = answer.toLowerCase();
      const hit = candidates.find((s) => lower.includes(s.toLowerCase()));
      return { pass: !hit, reason: hit ? `unexpectedly contains "${hit}"` : "ok" };
    }
    case "regex": {
      if (!c.pattern) return { pass: false, reason: "case is missing a pattern" };
      const pass = new RegExp(c.pattern, "i").test(answer);
      return { pass, reason: pass ? "ok" : `no match for /${c.pattern}/` };
    }
    case "max-sentences": {
      const n = countSentences(answer);
      const max = c.maxSentences ?? 3;
      const pass = n <= max;
      return { pass, reason: pass ? "ok" : `got ${n} sentences, expected at most ${max}` };
    }
    case "model-graded": {
      if (!CF_TOKEN || !CF_ACCOUNT_ID) {
        return { pass: "skipped", reason: "skipped — CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID not set" };
      }
      if (!c.rubric) return { pass: false, reason: "case is missing a rubric" };
      try {
        const graded = await gradeWithAI(c.rubric, answer);
        return { pass: graded.pass, reason: graded.reason };
      } catch (err) {
        return { pass: false, reason: `grading call failed: ${(err as Error).message}` };
      }
    }
  }
}

async function runCase(c: EvalCase): Promise<CaseResult> {
  let answer = "";
  try {
    const res = await fetch(`${CHAT_ENDPOINT}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: c.question, stream: false }),
    });
    const body = (await res.json()) as any;
    if (!body?.ok) {
      return { id: c.id, question: c.question, answer: "", pass: false, reason: body?.error ?? "chat endpoint returned an error" };
    }
    answer = body?.answer ?? "";
  } catch (err) {
    return {
      id: c.id,
      question: c.question,
      answer: "",
      pass: false,
      reason: `could not reach ${CHAT_ENDPOINT}: ${(err as Error).message}`,
    };
  }

  const result = await checkAnswer(c, answer);
  return { id: c.id, question: c.question, answer, pass: result.pass, reason: result.reason };
}

async function main() {
  console.log(`Running ${EVAL_CASES.length} eval cases against ${CHAT_ENDPOINT} ...\n`);

  const results: CaseResult[] = [];
  for (const c of EVAL_CASES) {
    const r = await runCase(c);
    results.push(r);
    const icon = r.pass === true ? "✅" : r.pass === "skipped" ? "⏭️ " : "❌";
    console.log(`${icon} ${r.id} — ${c.question}`);
    if (r.pass === false) console.log(`    ${r.reason}`);
  }

  const total = results.length;
  const passed = results.filter((r) => r.pass === true).length;
  const skipped = results.filter((r) => r.pass === "skipped").length;
  const failed = total - passed - skipped;
  const passRate = total ? Math.round((passed / total) * 100) : 0;

  console.log(`\n${passed}/${total} passed, ${failed} failed, ${skipped} skipped (${passRate}% pass rate)`);

  // ── Write a markdown report — this is the "sample report" referenced in EVALS.md ──
  const lines: string[] = [];
  lines.push(`# Eval Report`);
  lines.push("");
  lines.push(`Run at: ${new Date().toISOString()}`);
  lines.push(`Endpoint: ${CHAT_ENDPOINT}`);
  lines.push(`Result: ${passed}/${total} passed, ${failed} failed, ${skipped} skipped (${passRate}%)`);
  lines.push("");
  lines.push("| ID | Result | Question | Note |");
  lines.push("|---|---|---|---|");
  for (const r of results) {
    const icon = r.pass === true ? "PASS" : r.pass === "skipped" ? "SKIP" : "FAIL";
    const note = r.pass === true ? "—" : r.reason;
    lines.push(`| ${r.id} | ${icon} | ${r.question.replace(/\|/g, "\\|")} | ${note.replace(/\|/g, "\\|")} |`);
  }
  writeFileSync("evals/report.md", lines.join("\n") + "\n");
  console.log("\nWrote evals/report.md");

  // Non-zero exit for local/manual use — but the CI workflow runs this step
  // with `continue-on-error: true`, which is what actually keeps it
  // informational rather than merge-blocking. See DECISIONS.md.
  if (failed > 0) process.exitCode = 1;
}

main();