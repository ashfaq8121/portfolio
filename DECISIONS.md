# DECISIONS.md

## Why Astro
I chose Astro because it generates fast static HTML pages with no JavaScript by default. It also has an official Cloudflare adapter that makes deployment simple. I looked at Next.js but it felt too heavy for a portfolio site.

## Why Cloudflare Workers
The assignment required Cloudflare. Workers are good because they handle both static pages and API routes in one place. The free tier is generous and the deployment is fast.

## Contact Form
The form sends a POST request to `/api/contact` which is an Astro API route running as a Cloudflare Worker function. I used Resend to send emails because MailChannels stopped being free for Cloudflare Workers in 2024. Rate limiting uses Cloudflare KV — max 3 messages per IP per hour to prevent spam (lowered from an initial 5 after testing showed 5 was too generous for a low-traffic portfolio site).

## Why Web3Forms
I originally used Resend but it requires a verified domain to send emails to any address.
Web3Forms is completely free, requires no domain verification, and delivers directly
to Gmail. For a portfolio contact form it is the simplest solution with zero configuration.

## Email Validation — Gmail Only
The contact form's email validation was tightened to only accept `@gmail.com` addresses, enforced identically in both the shared `src/lib/validate.ts` (used for any future client-side validation) and `src/pages/api/contact.ts` (server-side, authoritative). This was a deliberate restriction for this specific form rather than a general best practice — it keeps every submission landing in a Gmail inbox, simplifying the Web3Forms delivery path. The validation order is: empty check → length check → general email format check → Gmail-domain check, so the most specific and most useful error message is always the one shown.

## Output Mode
I used `output: server` in Astro config because the contact form needs a server-side API route. This means Cloudflare handles every request dynamically.

## Extension 1 — Auth Mechanism Choice

I chose an **HttpOnly session cookie** over a signed JWT because:
- HttpOnly cookies cannot be read by JavaScript — safe from XSS attacks.
- For a single admin there is no need for stateless token verification.
- Works with `credentials: 'same-origin'` fetch calls with no extra headers.

## Extension 1 — What I Would Change at 10,000 Entries
- Add an index on `submitted_at` for fast ordering.
- Add pagination (LIMIT 50 OFFSET ?) to avoid loading all rows.
- Add a search filter by name or email.
- Soft-delete is already implemented so no data is ever lost.

## Extension 1 — Migrations
Applied manually via `wrangler d1 migrations apply portfolio-db --remote`
before the first deploy. The migration file is checked into the repo
at `migrations/0001_init.sql` so the schema is fully reproducible.

## Extension 1 — Admin Dashboard Timestamps
Submission timestamps are stored in D1 as UTC but displayed in the admin dashboard converted to IST (`Asia/Kolkata`, UTC+5:30) via `toLocaleString` with an explicit `timeZone` option, since that's the timezone I actually read the dashboard from. The column header is labelled `Date (IST)` so there's no ambiguity about which timezone is shown.

- **Auto OG images** — generating a unique OG image per blog post requires a headless browser. Too complex for the time available. One static OG image works fine.
- **Print stylesheet** — nice to have but not required. Added to future improvements list.

## Extension 2 — Caching Strategy

The `/api/github` endpoint sets `Cache-Control: public, max-age=300` on its response, so Cloudflare's edge caches it for 5 minutes. Repeated visits to the projects page within that window don't trigger a new call to GitHub. This reduces load against GitHub's rate limit (much lower for unauthenticated calls, generous but still finite for authenticated ones) and speeds up page load for visitors. Five minutes was chosen because repo metadata — stars, description, last updated — doesn't change often enough to need real-time freshness, while still being short enough that real updates show up reasonably quickly.

`/api/posts` and `/api/posts/:slug` are not cached the same way. They read from in-repo post data rather than calling an external service, so there's no network round-trip to save — the computation is cheap enough that caching would add complexity for no real benefit.

## Extension 2 — Failure Handling

If the GitHub API call fails — network error, timeout, rate limit, or any non-200 response — the Worker catches the error, logs it server-side with `console.error`, and returns a `503` with a consistent shape: `{ ok: false, repos: [], error: "..." }`. The error never bubbles up and breaks the page; the frontend is expected to check `ok` and fall back to an empty state with a friendly message. This was chosen over a client-side retry or surfacing a raw error, because a portfolio page should always render something presentable to a visitor even when a third-party service is temporarily unavailable.

A missing blog post (`/api/posts/:slug` with an unknown slug) is treated differently — it's a normal `404`, not a failure. "This post doesn't exist" is a valid, expected outcome of a lookup, not an error condition, so it doesn't get the same catch-and-degrade treatment as the GitHub integration.

## Extension 2 — Why the Blog API Duplicates Post Data

The blog post content was already hardcoded directly inside `src/pages/blog/index.astro` and `src/pages/blog/[slug].astro` before this extension. Rather than refactor those pages to pull from a shared module — which risked changing how the live blog pages behave or render — I chose to duplicate the same post data inside the new `src/pages/api/posts.ts` and `src/pages/api/posts/[slug].ts` files instead. This keeps the existing, working blog pages completely untouched while still exposing the same content through a documented API.

The trade-off is that adding a new blog post now means updating the data in two places instead of one. If this project keeps growing, the right long-term fix — listed below under "What I Would Do Differently" — is to move to Astro content collections (Markdown + `getCollection`) as a single source of truth that both the pages and the API read from.

## Extension 2 — Secrets Handling

The GitHub token is stored as a Cloudflare Workers secret (`GITHUB_TOKEN`) via `wrangler secret put`. It is never committed to the repo, never exposed in client-side code, and is only read server-side inside the Worker at request time via the Cloudflare `env` binding.

## What I Would Do Differently
- Use a content collection for blog posts from the start instead of hardcoded arrays. This makes adding new posts much easier, and would let the API and the pages share one source of data instead of duplicating it.
- Write tests before writing the feature code, not after.
- Set up GitHub Actions before writing any code so every push is tested from day one.

## AI Usage
I used Claude to review my code files for bugs, fix specific issues like a missing closing style tag and a stray head block in wrong place, generate corrected versions of config files, and help structure the deployment steps. For Extension 2, I used Claude to help design and write the GitHub repos API, the blog posts API endpoints, the OpenAPI spec, and these design documents (HLD, ARCHITECTURE, DECISIONS) — and to debug a live deployment issue where the posts API routes initially returned 404 despite a merged PR, which turned out to be a merge/sync issue between branches. All personal content including the About page, project descriptions, and blog posts was written by me. All design decisions and technical choices — including the choice not to refactor the existing blog pages, and the Gmail-only validation restriction — were my own.

## What I Want to Add Next
- Markdown-based blog posts using Astro content collections, as a single source of truth for both the pages and the `/api/posts` endpoints
- Lighthouse score improvements
- Auto-generated OG images per post
- Store contact form submissions in D1 database
- Add Cloudflare Web Analytics
- API versioning under `/api/v1/` if the contract needs to change in a breaking way later
