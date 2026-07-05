/**
 * evals/run-evals.test.ts
 *
 * Lets you run the eval suite through Vitest too (`npx vitest run evals/`)
 * if that's more convenient than the CLI script — same underlying logic,
 * just wrapped in a test() so it gets Vitest's reporting.
 *
 * NOT included in the default `npm run test` glob on purpose — that command
 * is what `.github/workflows/ci.yml` runs as a required, merge-blocking
 * check, and evals are deliberately informational (real AI calls cost
 * money/time and can be flaky in a way unit tests shouldn't be). See
 * DECISIONS.md. Run evals explicitly via `npm run evals` or the dedicated
 * `evals.yml` CI workflow instead.
 */
import { describe, it, expect } from "vitest";
import { EVAL_CASES } from "./cases";

describe("eval cases are well-formed", () => {
  it("every case has a question and a check", () => {
    for (const c of EVAL_CASES) {
      expect(c.question.length).toBeGreaterThan(0);
      expect(c.check).toBeTruthy();
    }
  });

  it("contains/not-contains cases specify what to look for", () => {
    for (const c of EVAL_CASES) {
      if (c.check === "contains" || c.check === "not-contains") {
        expect(c.expected, `case "${c.id}" is missing "expected"`).toBeTruthy();
      }
    }
  });

  it("model-graded cases specify a rubric", () => {
    for (const c of EVAL_CASES) {
      if (c.check === "model-graded") {
        expect(c.rubric, `case "${c.id}" is missing a rubric`).toBeTruthy();
      }
    }
  });

  it("has between 15 and 25 cases as required by the brief", () => {
    expect(EVAL_CASES.length).toBeGreaterThanOrEqual(15);
    expect(EVAL_CASES.length).toBeLessThanOrEqual(25);
  });
});

// Note: this file intentionally does NOT call the live chat endpoint —
// that's what `npm run evals` (evals/run-evals.ts) does. This file just
// sanity-checks the case definitions themselves are valid, which IS safe
// to run as a fast, free, required check on every PR.