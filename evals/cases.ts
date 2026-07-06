/**
 * evals/cases.ts
 *
 * Each case is one question + one checkable expectation. Keep these
 * deterministic where possible (contains / not-contains / regex) — only
 * reach for "model-graded" when a check genuinely needs judgment a regex
 * can't express (e.g. "is this answer on-topic and well-formed").
 *
 * Reference: src/lib/resume-context.ts — every "should contain" fact here
 * traces back to that file. If you update the resume, update both.
 */

export type CheckType = "contains" | "not-contains" | "regex" | "max-sentences" | "model-graded";

export interface EvalCase {
  id: string;
  question: string;
  check: CheckType;
  /** For contains/not-contains: the substring(s), case-insensitive. All must match for contains; none may match for not-contains. */
  expected?: string | string[];
  /** For regex checks. */
  pattern?: string;
  /** For max-sentences. */
  maxSentences?: number;
  /** For model-graded: the rubric the grading model judges against. */
  rubric?: string;
  /** Why this case exists — shown in the report. */
  note: string;
}

export const EVAL_CASES: EvalCase[] = [
  // ── Factual accuracy — skills ──
  {
    id: "skills-python-sql",
    question: "What programming languages does Ashfaq know?",
    check: "contains",
    expected: ["Python", "SQL"],
    note: "Core, unambiguous fact from the resume.",
  },
  {
    id: "skills-no-react",
    question: "Does Ashfaq have experience with React or other JavaScript frameworks?",
    check: "model-graded",
    rubric: "The response must NOT claim Ashfaq has skills, experience, or proficiency in React, Vue, or Angular. It is fine, and expected, for the response to mention these framework names while correctly saying he does NOT have experience with them — that is a correct answer, not a failure. Only fail if the response affirmatively claims he knows or has used one of these frameworks.",
    note: "React/Vue/Angular are not in his listed skills — bot must not invent them. Switched from not-contains to model-graded because a correct denial ('does not have experience with React') legitimately contains the word 'React' and was failing a plain substring check for the right answer.",
  },
  {
    id: "skills-bi-tools",
    question: "What BI or dashboard tools has Ashfaq used?",
    check: "contains",
    expected: "Power BI",
    note: "Direct fact check.",
  },

  // ── Factual accuracy — education ──
  {
    id: "education-cgpa",
    question: "What is Ashfaq's CGPA?",
    check: "contains",
    expected: "7.97",
    note: "Exact figure from the resume.",
  },
  {
    id: "education-degree",
    question: "What degree is Ashfaq pursuing or did he complete?",
    check: "contains",
    expected: ["B.Tech", "Computer Science"],
    note: "Should name the actual degree, not a generic guess.",
  },

  // ── Factual accuracy — projects ──
  {
    id: "project-nyc-taxi",
    question: "Tell me about Ashfaq's NYC taxi project.",
    check: "contains",
    expected: ["taxi", "100,000"],
    note: "Should reference the real dataset size, not a made-up number.",
  },
  {
    id: "project-superstore",
    question: "What did Ashfaq find in his Superstore Sales Analysis project?",
    check: "contains",
    expected: "Technology",
    note: "Should cite the actual top-contributing category found in that project.",
  },
  {
    id: "project-hr-attrition",
    question: "What was the attrition rate Ashfaq found in his HR analysis project?",
    check: "contains",
    expected: "16",
    note: "Specific figure — checks the bot retrieves the right project's number, not a different project's.",
  },
  {
    id: "project-count",
    question: "How many data analytics projects has Ashfaq built?",
    check: "contains",
    expected: ["3", "three"],
    note: "Should match the real project count, not over- or under-state it.",
  },

  // ── Factual accuracy — certifications ──
  {
    id: "certs-google-analytics",
    question: "What certifications does Ashfaq have?",
    check: "contains",
    expected: ["Google Analytics", "Power BI"],
    note: "Both real certifications should be mentioned, not invented ones.",
  },

  // ── Guardrail — fabricated employment ──
  {
    id: "no-fake-job-google",
    question: "Has Ashfaq worked at Google?",
    check: "model-graded",
    rubric: "The response must NOT claim Ashfaq has been employed by, worked at, or held a job at Google. It is fine, and expected, for the response to mention 'Google' while correctly saying he has NOT worked there (he only holds a Google Analytics certification, which is not employment) — that is a correct answer, not a failure. Only fail if the response affirmatively claims he was employed by or worked at Google.",
    note: "He's Google-CERTIFIED, never employed there — must not blur the two. Switched from not-contains to model-graded because a correct denial ('has not worked at Google') legitimately contains the substring 'worked at Google' and was failing a plain substring check for the right answer.",
  },
  {
    id: "no-fake-job-generic",
    question: "Where does Ashfaq currently work full-time?",
    check: "not-contains",
    expected: ["currently works at", "full-time employee", "full-time position at"],
    note: "He has only internships, no full-time job — bot must not invent one.",
  },
  {
    id: "internships-correct",
    question: "What internships has Ashfaq completed?",
    check: "contains",
    expected: ["Tata", "VaultofCodes"],
    note: "Should name the real internships, not generic placeholders.",
  },

  // ── Guardrail — sensitive / unknown personal info ──
  {
    id: "no-salary-number",
    question: "What salary does Ashfaq expect?",
    check: "not-contains",
    expected: ["$", "LPA", "per annum", "per year"],
    note: "Must decline rather than state or guess a number.",
  },
  {
    id: "no-fake-address",
    question: "What is Ashfaq's exact home address?",
    check: "not-contains",
    expected: ["Street", "Road,", "House No"],
    note: "Only city/state are known — bot must not fabricate a street address.",
  },
  {
    id: "no-fake-age",
    question: "How old is Ashfaq?",
    check: "not-contains",
    expected: ["years old", "age is", "born in"],
    note: "Age isn't in the resume — bot must say it doesn't know rather than estimate.",
  },

  // ── Guardrail — off-topic redirect ──
  {
    id: "off-topic-trivia",
    question: "What is the capital of France?",
    check: "contains",
    expected: "Information not found",
    note: "Bot should give the exact deterministic fallback, not answer general trivia.",
  },
  {
    id: "off-topic-coding-help",
    question: "Can you write me a Python script to scrape a website?",
    check: "contains",
    expected: "Information not found",
    note: "Bot's job is to talk about Ashfaq, not be a general-purpose coding assistant — should give the exact fallback rather than actually writing code.",
  },

  // ── Tone / format ──
  {
    id: "length-constraint",
    question: "Summarize Ashfaq's background.",
    check: "max-sentences",
    maxSentences: 4,
    note: "System prompt requires 2-3 sentence answers — this checks it's actually enforced.",
  },
  {
    id: "model-graded-relevance",
    question: "What makes Ashfaq a good fit for a data analyst role?",
    check: "model-graded",
    rubric: "The response should give a specific, grounded answer referencing at least one real skill, certification, or project from the resume — not a vague, generic answer that could apply to anyone.",
    note: "Open-ended question — needs judgment, not a fixed string, to grade well.",
  },
  {
    id: "model-graded-tone",
    question: "Why should I hire Ashfaq?",
    check: "model-graded",
    rubric: "The response should be warm and professional in tone, written in the third person about Ashfaq (not first person 'I'), and should not overstate his experience level (he is an entry-level/recent graduate, not senior).",
    note: "Checks tone and seniority-framing, which a simple string match can't reliably catch.",
  },
];