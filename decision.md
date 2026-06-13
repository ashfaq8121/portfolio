# DECISIONS.md

## Why Astro
I chose Astro because it generates fast static HTML pages with no JavaScript by default. It also has an official Cloudflare adapter that makes deployment simple. I looked at Next.js but it felt too heavy for a portfolio site.

## Why Cloudflare Workers
The assignment required Cloudflare. Workers are good because they handle both static pages and API routes in one place. The free tier is generous and the deployment is fast.

## Contact Form
The form sends a POST request to `/api/contact` which is an Astro API route running as a Cloudflare Worker function. I used Resend to send emails because MailChannels stopped being free for Cloudflare Workers in 2024. Rate limiting uses Cloudflare KV — max 5 messages per IP per hour to prevent spam.

## Why Web3Forms
I originally used Resend but it requires a verified domain to send emails to any address.
Web3Forms is completely free, requires no domain verification, and delivers directly
to Gmail. For a portfolio contact form it is the simplest solution with zero configuration.

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

- **Auto OG images** — generating a unique OG image per blog post requires a headless browser. Too complex for the time available. One static OG image works fine.
- **Print stylesheet** — nice to have but not required. Added to future improvements list.

## What I Would Do Differently
- Use a content collection for blog posts from the start instead of hardcoded arrays. This makes adding new posts much easier.
- Write tests before writing the feature code, not after.
- Set up GitHub Actions before writing any code so every push is tested from day one.

## AI Usage
I used Claude to review my code files for bugs, fix specific issues like a missing closing style tag and a stray head block in wrong place, generate corrected versions of config files, and help structure the deployment steps. All personal content including the About page, project descriptions, and blog posts was written by me. All design decisions and technical choices were my own.

## What I Want to Add Next
- Markdown-based blog posts using Astro content collections
- Lighthouse score improvements
- Auto-generated OG images per post
- Store contact form submissions in D1 database
- Add Cloudflare Web Analytics