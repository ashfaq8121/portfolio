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
| Contact | Form that sends email directly to my inbox and saves to database |
| Admin | Password-protected dashboard to view and manage contact submissions |
| 404 | Friendly not found page |

---

## Tech Stack

| Tool | What I used it for |
|---|---|
| Astro | Building all the pages and components |
| TypeScript | Writing safe and clean code |
| CSS | Styling and dark mode |
| Cloudflare Workers | Hosting the site and running all API routes |
| Cloudflare KV | Rate limiting the contact form (max 5 per IP per hour) |
| Cloudflare D1 | Storing contact form submissions in a SQLite database |
| Web3Forms | Sending contact form emails to my inbox |
| Vitest | Unit tests |
| GitHub Actions | Automatic deployment on every push |

---

## Project Structure

```
my-portfolio/
├── .github/
│   └── workflows/
│       ├── ci.yml              # Runs tests on every pull request
│       └── deploy.yml          # Deploys to Cloudflare on every push to main
├── migrations/
│   └── 0001_init.sql           # D1 database schema (contact_submissions table)
├── public/
│   ├── favicon.png
│   ├── og-default.png
│   └── robots.txt
├── src/
│   ├── components/             # Reusable components (Nav, Footer, BlogCard, etc.)
│   ├── layouts/                # BaseLayout and BlogLayout
│   ├── pages/                  # All pages and routes
│   │   ├── index.astro         # Home page
│   │   ├── about.astro         # About page
│   │   ├── projects.astro      # Projects page
│   │   ├── contact.astro       # Contact page
│   │   ├── admin.astro         # Admin dashboard (password-protected)
│   │   ├── 404.astro           # Not found page
│   │   ├── rss.xml.ts          # RSS feed
│   │   └── blog/
│   │       ├── index.astro     # Blog list page
│   │       └── [slug].astro    # Individual blog post page
│   └── styles/                 # Global CSS variables and reset
├── worker/
│   ├── index.ts                # Worker entry point and request router
│   └── api/
│       ├── contact.ts          # Contact form handler (email + D1 save + rate limit)
│       └── contact.test.ts     # Unit tests
├── astro.config.mjs            # Astro configuration
├── wrangler.toml               # Cloudflare Workers, KV, and D1 configuration
├── package.json                # Dependencies and scripts
├── tsconfig.json               # TypeScript configuration
├── plan.md                     # Project plan and decisions
├── design.md                   # Design notes
├── decision.md                 # Architecture decision records
└── testing.md                  # Testing notes
```

---

## How the Contact Form Works

1. User submits the form on `/contact`
2. The Worker checks rate limiting via **Cloudflare KV** — max 5 submissions per IP per hour
3. The submission is saved to **Cloudflare D1** (`contact_submissions` table)
4. An email notification is sent via **Web3Forms**
5. The admin can view all submissions at `/admin`

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

## Admin Dashboard

The `/admin` page is a password-protected dashboard that shows all contact form submissions stored in D1.

- Login uses an **HttpOnly session cookie** (safe from XSS)
- Submissions are listed with name, email, message, and timestamp
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

Note — the contact form (email sending and D1 saving) only works on the deployed Cloudflare site, not locally.

---

## Deployment

Deployment is fully automatic via GitHub Actions.

Every push to `main` triggers the deploy workflow which:
1. Installs dependencies
2. Builds the site
3. Deploys to Cloudflare Workers

**Before the first deploy**, apply the D1 migration manually:

```bash
wrangler d1 migrations apply portfolio-db --remote
```

Never run `wrangler deploy` manually after that — always push through GitHub.

---

## Available Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start local dev server |
| `npm run build` | Build site to /dist |
| `npm run test` | Run unit tests |
| `npm run deploy` | Build and deploy manually (first deploy only) |

---

## Environment Secrets

| Secret | Where to set | What it is |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | GitHub Actions secret | Token for automatic deployment |
| `ADMIN_PASSWORD` | Cloudflare Workers secret | Password for the `/admin` dashboard |

The Web3Forms access key is hardcoded (public key — safe to commit).

---

## Contact

- Email: urrahmanmohammadashfaq@gmail.com
- LinkedIn: https://linkedin.com/in/ashfaq-ur-rahman-54832027b
- GitHub: https://github.com/ashfaq8121
- WhatsApp: +91 8121745748

---

Built by Ashfaq ur Rahman