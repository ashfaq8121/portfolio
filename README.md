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
| Contact | Form that sends email directly to my inbox |
| 404 | Friendly not found page |

---

## Tech Stack

| Tool | What I used it for |
|---|---|
| Astro | Building all the pages and components |
| TypeScript | Writing safe and clean code |
| CSS | Styling and dark mode |
| Cloudflare Workers | Hosting the site and running the contact form |
| Cloudflare KV | Rate limiting the contact form |
| Resend | Sending contact form emails |
| Vitest | Unit tests |
| GitHub Actions | Automatic deployment on every push |

---

## Project Structure

```
my-portfolio/
├── .github/
│   └── workflows/
│       ├── ci.yml          # Runs tests on every pull request
│       └── deploy.yml      # Deploys to Cloudflare on every push to main
├── public/
│   ├── favicon.png
│   ├── og-default.png
│   └── robots.txt
├── src/
│   ├── components/         # Reusable components (Nav, Footer, BlogCard, etc.)
│   ├── layouts/            # BaseLayout and BlogLayout
│   ├── pages/              # All pages and routes
│   │   ├── index.astro     # Home page
│   │   ├── about.astro     # About page
│   │   ├── projects.astro  # Projects page
│   │   ├── contact.astro   # Contact page
│   │   ├── 404.astro       # Not found page
│   │   ├── rss.xml.ts      # RSS feed
│   │   ├── api/
│   │   │   └── contact.ts  # Contact form API (Cloudflare Worker)
│   │   └── blog/
│   │       ├── index.astro # Blog list page
│   │       └── [slug].astro# Individual blog post page
│   └── styles/             # Global CSS variables and reset
├── worker/
│   ├── index.ts            # Worker entry point
│   └── api/
│       ├── contact.ts      # Contact form handler
│       └── contact.test.ts # Unit tests
├── astro.config.mjs        # Astro configuration
├── wrangler.toml           # Cloudflare Workers configuration
├── package.json            # Dependencies and scripts
└── tsconfig.json           # TypeScript configuration
|__ plan.md
|__design.md
|__decision.md
|__testing.md

```

---

## Local Development

```bash
# Install dependencies
npm install

# Start local dev server
npm run dev
```

Site runs at `http://localhost:4321`

Note — the contact form only works on the deployed Cloudflare site, not locally.

---

## Deployment

Deployment is fully automatic via GitHub Actions.

Every push to `main` triggers the deploy workflow which:
1. Installs dependencies
2. Builds the site
3. Deploys to Cloudflare Workers

Never run `wrangler deploy` manually — always push through GitHub.

---

## Available Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start local dev server |
| `npm run build` | Build site to /dist |
| `npm run test` | Run unit tests |
| `npm run deploy` | Build and deploy manually (use only for first deploy) |

---

## Environment Secrets

| Secret | Where to set | What it is |
|---|---|---|
| Web3Forms | Sending contact form emails |
| `CLOUDFLARE_API_TOKEN` | GitHub Actions secret | Token for auto-deployment |

---

## Contact

- Email: urrahmanmohammadashfaq@gmail.com
- LinkedIn: https://linkedin.com/in/ashfaq-ur-rahman-54832027b
- GitHub: https://github.com/ashfaq8121
- WhatsApp: +91 8121745748

---

Built by Ashfaq ur Rahman
