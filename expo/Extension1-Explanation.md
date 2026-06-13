# Extension 1 — Backend & Data Layer
## What I Built and Why (Simple Explanation)

---

## The Problem Before

My portfolio website was **static** — like a printed brochure.
When someone filled the contact form, the data went nowhere permanent.
I could not see who contacted me unless they emailed me directly.

---

## What I Added

### 1. A Database (Cloudflare D1)
Think of it like an Excel spreadsheet living in the cloud.
Every time someone fills the contact form, their name, email,
and message gets saved into this spreadsheet automatically.
Even if the website restarts or redeploys, the data is still there.

### 2. A Migration File (`migrations/0001_init.sql`)
This is a blueprint of the database. It describes what columns
exist — name, email, message, date, etc. Anyone can run this
file and recreate the exact database from scratch.
Like a recipe that always makes the same dish.

### 3. Server-Side Saving (`src/pages/api/contact.ts`)
When someone clicks "Send message", the Worker (server code)
does two things:
- Saves the data to the D1 database permanently
- Calls Web3Forms from the browser to send an email notification

### 4. Admin Login Page (`/admin`)
A secret page only I know about. Protected by a password.
Visitors cannot find it because it is not in the navbar.
When I login, I see a table of everyone who has contacted me.

### 5. Session Cookie Authentication
When I enter the correct password, the server gives my browser
a special cookie — like a wristband at an event. Every time
I visit `/admin`, the server checks for that wristband.
If it is missing or wrong, I get a 401 Unauthorized error
and see nothing.

### 6. Soft Delete
When I click Delete on an entry in the admin page, it does not
actually erase the data. It just marks it as `is_deleted = 1`
— hidden from view but still in the database. Like putting
something in the recycle bin instead of permanently deleting it.

### 7. Server-Side Validation
Before saving anything to the database, the server checks:
- Name must be 2–100 characters
- Email must be a valid email format
- Message must be 10–4000 characters
- HTML tags are stripped out (prevents malicious code injection)

This happens on the **server**, not just in the browser — so
even if someone bypasses the form and sends raw requests,
the validation still runs.

### 8. DATA-MODEL.md
A document explaining exactly what the database looks like,
what each column stores, and why those choices were made.
Required by the assignment.

### 9. DECISIONS.md
A document explaining why I chose a session cookie over JWT
tokens for authentication, and what I would change if there
were 10,000 entries.

---

## Files I Created or Modified

| File | What it does |
|------|-------------|
| `migrations/0001_init.sql` | Creates the database table |
| `wrangler.toml` | Connects the D1 database to the Worker |
| `src/pages/api/contact.ts` | Saves form data to D1 |
| `src/pages/api/admin/login.ts` | Checks password, sets cookie |
| `src/pages/api/admin/logout.ts` | Clears the cookie |
| `src/pages/api/admin/submissions.ts` | Returns or deletes entries |
| `src/pages/admin.astro` | The admin dashboard UI |
| `src/pages/contact.astro` | Updated to call Web3Forms from browser |
| `DATA-MODEL.md` | Documents the database schema |
| `decision.md` | Documents auth choice and future improvements |

---

## The Shipping Workflow I Followed

1. Created branch `feat/ext-1-backend-data` — kept main safe
2. Did all work on that branch
3. Pushed to GitHub — CI ran automatically
4. Opened a Pull Request into main
5. Added makhil006 as reviewer
6. After approval → merge to main → live in production

---

## How to Validate (from the assignment)

| Check | Result |
|-------|--------|
| Migration file exists and recreates schema | ✅ migrations/0001_init.sql |
| Submitting form persists data in admin view | ✅ Verified locally and in production |
| Admin view is inaccessible when logged out | ✅ Returns 401 Unauthorized |
| Server-side validation rejects bad input | ✅ Empty, oversized, HTML tags all rejected |
| Concurrency — two people submit at once | ✅ D1/SQLite serialises writes, no duplicates |
| Soft-delete implemented | ✅ Stretch goal completed |

---

## In One Sentence

> I added a real backend to my portfolio — every contact form
> submission is now saved to a cloud database, and I can view,
> manage, and delete them through a password-protected admin page
> that nobody else can access.
