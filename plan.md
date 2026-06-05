# PLAN.md

## What I Built
A personal portfolio website with a blog, projects showcase, and contact form. Deployed on Cloudflare Workers.

## Tech Stack
- **Astro** — for building the site
- **Cloudflare Workers** — for hosting and the contact form API
- **Cloudflare KV** — for rate limiting the contact form
- **Resend** — for sending contact form emails
- **Vitest** — for unit tests
- **GitHub Actions** — for automatic deployment

## Pages Built
- Home — introduction and links
- About — my background and skills
- Projects — 3 real projects I built
- Blog — 3 articles based on my projects
- Contact — form that sends email to my inbox
- 404 — page not found

## What I Cut
- D1 database for storing form submissions — email is enough for now
- Auto-generated OG images per blog post — used one static image instead
- Print stylesheet — not enough time

