# Ashfaq ur Rahman — Portfolio

My personal portfolio website built with Astro and deployed on Cloudflare Workers.

**Live site:** https://portfolio.ashfaq-portfolio.workers.dev

**GitHub:** https://github.com/ashfaq8121/portfolio

---

## Pages

| Page | What it shows |
|---|---|
| Home | Introduction, headline, quick links |
| About | My background, skills, what I am working on |
| Projects | 3 real projects I built with details |
| Blog | 3 articles based on my real projects |
| Ask About Me | AI chatbot that answers questions about me, grounded in my real résumé |
| Contact | Form that sends email directly to my inbox and saves to database |
| Admin | Password-protected dashboard to view and manage contact submissions |
| 404 | Friendly not found page |

---

## Public JSON API

In addition to the website pages, the project exposes a small public, read-only JSON API —
documented with an OpenAPI 3.x spec at [`openapi.yaml`](./openapi.yaml). Anyone (a person, a
script, or another app) can call these without authentication.

| Endpoint | Method | What it returns |
|---|---|---|
| `/api/posts` | GET | List of all published blog posts (slug, title, description, tags, etc.) |
| `/api/posts/:slug` | GET | Full content of one blog post by slug, including the long-form body |
| `/api/github` | GET | My live public GitHub repositories, fetched directly from the GitHub API |

**Example:**
```bash
curl https://portfolio.ashfaq-portfolio.workers.dev/api/posts
curl https://portfolio.ashfaq-portfolio.workers.dev/api/posts/nyc-taxi-dashboard-lessons
curl https://portfolio.ashfaq-portfolio.workers.dev/api/github
```

### Status Codes

| Code | Meaning |
|---|---|
| `200` | Success |
| `400` | Bad request (e.g. missing required parameter) |
| `404` | Resource not found (e.g. unknown blog post slug) |
| `500` | Unexpected server error |
| `503` | External service (GitHub) is slow or unavailable |

All error responses share the same shape: `{ "ok": false, "error": "..." }`.

### External Integration — GitHub

`/api/github` calls the real GitHub REST API server-side to fetch my public repositories, using
a `GITHUB_TOKEN` stored as a Cloudflare Workers secret (never in the repo or client code). The
response is cached at the edge for 5 minutes via a `Cache-Control` header to reduce repeated
calls to GitHub. If GitHub is slow, rate-limited, or down, the endpoint degrades gracefully —
returning `503` with an empty repo list and a friendly error message instead of breaking the
page. See [`DECISIONS.md`](./DECISIONS.md) for the full reasoning behind the caching and
failure-handling approach.

### Design & Architecture Docs

- [`HLD.md`](./HLD.md) — high-level design: components, data flow, and sequence diagrams
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — code tour of how a request flows through each file
- [`DECISIONS.md`](./DECISIONS.md) — the reasoning behind caching, failure handling, and other
  technical choices made throughout the project
- [`EVALS.md`](./EVALS.md) — how the "Ask About Me" chatbot is tested for accuracy and safety

---

## Tech Stack

| Tool | What I used it for |
|---|---|
| Astro | Building all the pages, components, and JSON API routes |
| TypeScript | Writing safe and clean code |
| CSS | Styling and dark mode |
| Cloudflare Workers | Hosting the site and running all API routes |
| Cloudflare Workers AI | Powering the "Ask About Me" chatbot (GLM-4.7-flash model) |
| Cloudflare KV | Rate limiting the contact form (max 3 per IP per hour) |
| Cloudflare D1 | Storing contact form submissions in a SQLite database |
| Web3Forms | Sending contact form emails to my inbox |
| GitHub REST API | Live public repository data, surfaced through `/api/github` |
| OpenAPI 3.x | Documenting the public JSON API contract |
| Vitest | Unit tests |
| GitHub Actions | Automatic deployment on every push, gated by required PR review |

---

## Project Structure

```
my-portfolio/
├── .github/
│   └── workflows/
│       ├── ci.yml              # Runs tests + build on every pull request
│       ├── deploy.yml          # Deploys to Cloudflare on every push to main
│       └── evals.yml           # Runs the chatbot eval suite on every PR (informational)
├── migrations/
│   └── 0001_init.sql           # D1 database schema (contact_submissions table)
├── evals/
│   ├── cases.ts                 # 20 test questions + expected-answer rules for the chatbot
│   ├── run-evals.ts             # Runs all cases against the live chatbot, writes report.md
│   └── run-evals.test.ts        # Fast check that the test cases themselves are well-formed
├── public/
│   ├── favicon.png
│   ├── og-default.png
│   ├── ashfaq-ur-rahman-resume.pdf   # Downloadable résumé (linked from /ask)
│   └── robots.txt
├── src/
│   ├── components/             # Reusable components (Nav, Footer, BlogCard, etc.)
│   ├── layouts/                # BaseLayout and BlogLayout
│   ├── lib/
│   │   ├── validate.ts         # Shared validation logic (name, Gmail-only email, message)
│   │   ├── validate.test.ts    # Unit tests for validation logic
│   │   ├── resume-context.ts   # Chatbot's grounding data — my real résumé facts
│   │   └── chat-system-prompt.ts # Chatbot's behavior rules (guardrails, tone, fallback message)
│   ├── pages/                  # All pages and routes
│   │   ├── index.astro         # Home page
│   │   ├── about.astro         # About page
│   │   ├── projects.astro      # Projects page
│   │   ├── ask.astro           # "Ask About Me" chatbot page (category menu + free-text chat)
│   │   ├── contact.astro       # Contact page
│   │   ├── admin.astro         # Admin dashboard (password-protected, timestamps in IST)
│   │   ├── 404.astro           # Not found page
│   │   ├── rss.xml.ts          # RSS feed
│   │   ├── api/
│   │   │   ├── contact.ts      # Contact form handler (validation + KV rate limit + D1 save + email)
│   │   │   ├── chat.ts         # POST /api/chat — chatbot endpoint, streams answers from Workers AI
│   │   │   ├── github.ts       # GET /api/github — live GitHub repos, cached, with fallback on failure
│   │   │   ├── posts.ts        # GET /api/posts — list of all blog posts
│   │   │   ├── posts/
│   │   │   │   └── [slug].ts   # GET /api/posts/:slug — single blog post by slug
│   │   │   └── admin/
│   │   │       ├── login.ts    # Admin login, sets HttpOnly session cookie
│   │   │       ├── logout.ts   # Admin logout, clears session cookie
│   │   │       └── submissions.ts # Fetch/delete contact submissions (admin only)
│   │   └── blog/
│   │       ├── index.astro     # Blog list page
│   │       └── [slug].astro    # Individual blog post page
│   └── styles/                 # Global CSS variables and reset
├── astro.config.mjs            # Astro configuration
├── wrangler.toml                # Cloudflare Workers, KV, D1, and AI binding configuration
├── openapi.yaml                 # OpenAPI 3.x spec for the public JSON API
├── HLD.md                       # High-level design + sequence diagrams (Extensions 2 & 3)
├── ARCHITECTURE.md              # Code tour of API request flows (Extensions 2 & 3)
├── DECISIONS.md                 # Architecture decision records, including the chatbot's model
│                                  and eval-gating choices (Extension 3)
├── EVALS.md                      # Chatbot eval suite — test cases, sample report, blind spots
├── package.json                 # Dependencies and scripts
├── tsconfig.json                # TypeScript configuration
├── plan.md                      # Project plan and decisions
├── design.md                    # Design notes
└── testing.md                   # Testing notes
```

---

## How the Contact Form Works

1. User submits the form on `/contact`
2. Input is validated — only **Gmail addresses** (`@gmail.com`) are accepted
3. The Worker checks rate limiting via **Cloudflare KV** — max 3 submissions per IP per hour
4. The submission is saved to **Cloudflare D1** (`contact_submissions` table)
5. An email notification is sent via **Web3Forms**
6. The admin can view all submissions at `/admin`

### Validation Rules

| Field | Rules |
|---|---|
| Name | Required, 2–100 characters |
| Email | Required, must be a valid `@gmail.com` address |
| Message | Required, 10–4,000 characters |

### D1 Database Schema

```sql
CREATE TABLE IF NOT EXISTS contact_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  ip TEXT,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_deleted INTEGER NOT NULL DEFAULT 0
);
```

Soft-delete is used — records are marked `is_deleted = 1` rather than removed, so no data is ever permanently lost.

---

## Ask About Me — AI Chatbot + Evals

The `/ask` page is a small chatbot that answers visitor questions about me, grounded entirely in
my real résumé — it doesn't invent facts, jobs, or skills I don't actually have.

### How it works

1. A visitor clicks a ready-made question (organized by category: Education, Skills, Projects,
   Certifications, Other) or types their own.
2. The question is sent to `/api/chat`, which combines my real résumé facts
   (`resume-context.ts`) with a set of behavior rules (`chat-system-prompt.ts`) and the visitor's
   question, then sends all of it to **Cloudflare Workers AI** (model: `@cf/zai-org/glm-4.7-flash`).
3. The answer streams back token by token, so it appears to "type itself out" rather than
   showing up all at once after a long pause.
4. If a question has nothing to do with me, or asks for something my résumé doesn't cover, the
   bot always replies with one exact sentence — *"Information not found. Try one of the
   suggested questions above, or ask something else about Ashfaq."* — rather than a different
   made-up excuse every time.

### How it's tested

A 20-question eval suite (`evals/cases.ts`) checks the bot's answers for factual accuracy (e.g.
correct CGPA, correct project numbers) and safety guardrails (no invented jobs, no salary
numbers, no fabricated personal details). Run it yourself:

```bash
npm run evals
```

This calls the live chatbot for every test case and writes a pass/fail report to
`evals/report.md`. It also runs automatically (and non-blocking) on every pull request via
`.github/workflows/evals.yml`. Full details, including a demonstration that the suite catches a
deliberately introduced regression, are in [`EVALS.md`](./EVALS.md).

---

## Admin Dashboard

The `/admin` page is a password-protected dashboard that shows all contact form submissions stored in D1.

- Login uses an **HttpOnly session cookie** (safe from XSS)
- Submissions are listed with name, email, message, and timestamp
- All timestamps are displayed in **IST (Indian Standard Time, UTC+5:30)**
- Supports soft-delete so records can be hidden without being erased
- Styled with dark UI using Inter font and Indigo accent colors

The admin password is set via an environment secret — never hardcoded.

---

## Local Development

```bash
# Install dependencies
npm install

# Start local dev server
npm run dev
```

Site runs at `http://localhost:4321`

Note — the contact form (email sending and D1 saving), the GitHub repos API, admin login, and
the Ask About Me chatbot only work with a live Cloudflare connection, since they depend on
Wrangler secrets and bindings (including the AI binding) that need a remote connection even in
local dev.

---

## Deployment

Deployment is fully automatic via GitHub Actions, gated by a required pull request review.

The required shipping workflow for any change:
1. Create a dedicated feature branch and push it to GitHub
2. Deploy/preview the branch to verify it works (manual `wrangler deploy` or branch CI — no approval needed for this step)
3. Open a pull request from the branch into `main`
4. Get the PR reviewed and approved
5. Merge — landing on `main` is what triggers the production deploy, which:
   - Installs dependencies
   - Builds the site
   - Deploys to Cloudflare Workers

`main` is protected — it cannot be pushed to directly and cannot be merged without an approving review.

**Before the first deploy**, apply the D1 migration manually:

```bash
wrangler d1 migrations apply portfolio-db --remote
```

Never run `wrangler deploy` manually outside of testing a branch preview — production changes only happen through an approved pull request landing on `main`.

---

## Available Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start local dev server |
| `npm run build` | Build site to /dist |
| `npm run test` | Run unit tests |
| `npm run evals` | Run the 20-question chatbot eval suite against a live instance |
| `npm run deploy` | Build and deploy manually (branch testing / first deploy only) |

---

## Environment Secrets

| Secret | Where to set | What it is |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | GitHub Actions secret | Token for automatic deployment and CI build/eval steps |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions secret | Account ID needed alongside the API token for CI steps that touch Cloudflare |
| `ADMIN_PASSWORD` | Cloudflare Workers secret | Password for the `/admin` dashboard |
| `GITHUB_TOKEN` | Cloudflare Workers secret | Read-only token used by `/api/github` to call the GitHub REST API |

The Web3Forms access key is hardcoded (public key — safe to commit). The Ask About Me chatbot
uses Cloudflare Workers AI via a native binding (`[ai] binding = "AI"` in `wrangler.toml`) — no
separate API key needed. All other secrets are set via `wrangler secret put` and never appear in
the repo or in client-side code.

---

## Contact

- Email: urrahmanmohammadashfaq@gmail.com
- LinkedIn: https://linkedin.com/in/ashfaq-ur-rahman-54832027b
- GitHub: https://github.com/ashfaq8121
- WhatsApp: +91 8121745748

---

Built by Ashfaq ur Rahman
