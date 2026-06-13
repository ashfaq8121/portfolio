# EXPO — What I Built and How It Works

---
Why We Use Secret Keys — Simple Explanation

What is a Secret Key?
A secret key is like a password for a service.
For example:

Your Resend API key lets anyone send emails from your account
Your Cloudflare API token lets anyone deploy code to your website

If someone finds these keys they can:

Send thousands of spam emails using your account
Delete or change your entire website
Run up charges on your account

So you never put them in your code files that go to GitHub.

The Problem
Your code needs these keys to work. But your code is public on GitHub.
So how do you give the keys to your code without making them public?
Answer: Secret storage systems.
You have two of them in this project.

Secret #1 — GitHub Actions Secret
What key: CLOUDFLARE_API_TOKEN
What it does:
This token gives GitHub permission to deploy your website to Cloudflare automatically. Without it, GitHub Actions cannot run wrangler deploy.
Where you put it:
GitHub → your repo → Settings → Secrets and variables
→ Actions → New repository secret
Name: CLOUDFLARE_API_TOKEN
Value: your token from Cloudflare dashboard
How it works:
When GitHub Actions runs your deploy workflow, it reads this secret from GitHub's secure storage and uses it to authenticate with Cloudflare. Your actual token never appears in any file.
Why GitHub and not Cloudflare?
Because GitHub is the one doing the deploying. It needs the key to prove to Cloudflare "yes I am allowed to deploy this."

Secret #2 — Cloudflare Worker Secret
What key: RESEND_API_KEY (now replaced by Web3Forms key in code)
What it does:
This key was used to send emails via Resend. It was stored as a Cloudflare Worker secret so your contact form code could access it at runtime.
Where you put it:
bashnpx wrangler secret put RESEND_API_KEY
Cloudflare stores it encrypted. Your Worker code reads it from env.RESEND_API_KEY at runtime.
Why Cloudflare and not GitHub?
Because Cloudflare is the one running your contact form code. The Worker needs the key while it is processing form submissions. GitHub only needs keys during deployment.

Simple Diagram
YOUR LAPTOP
writes code → pushes to GitHub (no secrets in code)
                    ↓
GITHUB ACTIONS reads CLOUDFLARE_API_TOKEN from GitHub Secrets
                    ↓
deploys to CLOUDFLARE using that token
                    ↓
CLOUDFLARE WORKER runs your contact form
reads RESEND_API_KEY from Cloudflare Secrets
                    ↓
sends email ✅

Why Not Just Put Keys in the Code?
Imagine you wrote this in your code:
tsconst apiKey = "re_abc123realkey";
And pushed to GitHub. Now:

Anyone browsing your repo sees the key
Bots scan GitHub 24/7 looking for exposed keys
Within minutes your key gets stolen and abused
Resend bills you for thousands of emails you never sent

## What This Project Is

A personal portfolio website with pages, a blog, and a working contact form.
It is hosted on Cloudflare for free and deploys automatically through GitHub.

---

## Why Cloudflare?

The assignment required it. It is also free, fast, and hosts both your
pages and your contact form backend in one place.

---

## Why Astro?

Astro builds your pages into plain HTML files that load very fast.
It has an official Cloudflare plugin so deployment is simple.

---

## Why TypeScript?

TypeScript catches mistakes in your code before they reach real users.
For example if a function expects text but gets a number, TypeScript
warns you immediately instead of breaking on the live site.

---

## Every File in Simple Words

| File | What it does |
|------|--------------|
| `astro.config.mjs` | Settings for Astro — output mode, Cloudflare adapter |
| `wrangler.toml` | Settings for Cloudflare — Worker name, env variables |
| `package.json` | Lists all tools used and commands like build, test, deploy |
| `tsconfig.json` | TypeScript strictness settings |
| `.env.example` | Template showing what secret keys the project needs |
| `.gitignore` | Tells Git what NOT to upload (node_modules, .env, dist) |
| `.eslintrc.cjs` | Code quality rules — catches bad patterns automatically |

---

## Pages

| File | Page |
|------|------|
| `src/pages/index.astro` | Home page |
| `src/pages/about.astro` | About page |
| `src/pages/projects.astro` | Projects page |
| `src/pages/contact.astro` | Contact form page |
| `src/pages/404.astro` | Page not found |
| `src/pages/blog/index.astro` | Blog list |
| `src/pages/blog/[slug].astro` | Individual blog post |
| `src/pages/api/contact.ts` | Backend that receives form and sends email |
| `src/pages/rss.xml.ts` | RSS feed for the blog |

---

## What is RSS?

RSS lets people subscribe to your blog. When you write a new post,
RSS readers like Feedly automatically show it to subscribers.
It is like a newsletter but automatic. The assignment required it.

---

## What is the Blog?

Blog posts are stored as JavaScript objects in the code.
The `[slug].astro` file handles all post URLs — one file serves all posts.
For example `/blog/nyc-taxi-dashboard` and `/blog/sales-dashboard`
are both served by that one file.

---

## How the Contact Form Works

```
Visitor fills form
       ↓
Browser sends data to /api/contact
       ↓
Code validates name, email, message
       ↓
Checks rate limit (max 5 per hour per person)
       ↓
Sends to Web3Forms API
       ↓
Email arrives in Gmail ✅
```

---

## Why Web3Forms Instead of Resend?

Resend requires a verified domain to send emails. Web3Forms does not.
Just enter your Gmail, get a key, it works immediately. Free forever.

---

## What are the Worker Files?

`worker/api/contact.ts` is the same contact logic written separately
so the automated tests can import and test it directly without
needing a real server running.

---

## What are Tests?

Tests are code that checks your code works correctly.

```
npm run test
```

This checks automatically:
- Short name → rejected ✅
- Bad email → rejected ✅
- Valid form → sends email ✅
- 6th submission → blocked ✅

Without tests you only find bugs when real users hit them.
With tests you find them on your own laptop first.

---

## How CI/CD Works

**CI (Continuous Integration)**
Every time you push code to GitHub, it automatically:
1. Runs the linter
2. Runs TypeScript checks
3. Runs the tests
4. Builds the site

If anything fails, the code cannot be merged.

**CD (Continuous Deployment)**
Every time code is merged to main branch, it automatically:
1. Builds the site
2. Deploys to Cloudflare

You never deploy manually. Push code → it goes live automatically.

---

## Documentation Files

| File | Purpose |
|------|---------|
| `README.md` | How to set up and run the project |
| `PLAN.md` | What was planned before writing any code |
| `DESIGN.md` | Color, typography, layout decisions |
| `DECISIONS.md` | Why each technical choice was made |
| `TESTING.md` | What was tested manually and automatically |

---

## Assignment Completion

✅ All 6 pages built and working
✅ Contact form sends real emails to Gmail
✅ Dark mode with toggle
✅ Responsive on all screen sizes
✅ RSS feed
✅ Automated tests passing
✅ CI/CD via GitHub Actions
✅ Cloudflare Web Analytics installed
✅ Workers observability enabled
✅ All documentation files present

---

*Built by Ashfaq ur Rahman for IntegrAuth take-home assignment*
