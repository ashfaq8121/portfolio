/**
 * evals/run-evals.ts
 *
 * Standalone script — deliberately NOT part of the regular `npm run test`
 * Vitest suite that gates PRs (see DECISIONS.md for why). Run with:
 *   npm run evals
 *
 * Env vars:
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
 */
import { writeFileSync } from "fs";
import { EVAL_CASES, type EvalCase } from "./cases";

const CHAT_ENDPOINT = process.env.CHAT_ENDPOINT ?? "http://localhost:4321";
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const GRADING_MODEL = "@cf/meta/llama-3.1-8b-instruct";

interface CaseResult {
  id: string;
  question: string;
  answer: string;
  pass: boolean | "skipped";
  reason: string;
}

function countSentences(text: string): number {
  return text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean).length;
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
  const text: string = data?.result?.response ?? "";
  const pass = /^\s*pass/i.test(text);
  return { pass, reason: text.trim().slice(0, 220) || "(empty grading response)" };
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

/**
 * Calls /api/chat for one case, retrying once after a short delay if the
 * first attempt fails (network error, or the endpoint returning ok:false —
 * e.g. a transient Workers AI 502/504). A single upstream hiccup shouldn't
 * fail a case outright.
 */
async function runCase(c: EvalCase): Promise<CaseResult> {
  let answer = "";
  let lastError = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${CHAT_ENDPOINT}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: c.question, stream: false }),
      });
      const body = (await res.json()) as any;
      if (!body?.ok) {
        lastError = body?.error ?? "chat endpoint returned an error";
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        return { id: c.id, question: c.question, answer: "", pass: false, reason: lastError };
      }
      answer = body?.answer ?? "";
      break;
    } catch (err) {
      lastError = `could not reach ${CHAT_ENDPOINT}: ${(err as Error).message}`;
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      return { id: c.id, question: c.question, answer: "", pass: false, reason: lastError };
    }
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