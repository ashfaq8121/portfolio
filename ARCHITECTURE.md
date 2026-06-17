# ARCHITECTURE.md — Extension 2: API & Integration

## Files Added in This Extension

| File | Purpose |
|---|---|
| `src/pages/api/github.ts` | `GET /api/github` — calls the GitHub REST API, filters out forked repos, maps to a clean response shape, caches at the edge for 5 minutes, falls back gracefully on failure |
| `src/pages/api/posts.ts` | `GET /api/posts` — returns the list of all published blog posts as JSON |
| `src/pages/api/posts/[slug].ts` | `GET /api/posts/:slug` — returns one post's full content by slug, or 404 if not found |
| `openapi.yaml` | OpenAPI 3.x spec describing all three endpoints — request/response schemas, status codes |
| `HLD.md` | High-level design: components, data flow, and sequence diagrams |
| `DECISIONS.md` | Caching strategy and failure-handling rationale for this extension |

## Request Flow — GET /api/github

1. Browser or external client sends `GET /api/github`.
2. The Cloudflare Worker receives the request and reads the `GITHUB_TOKEN` secret from the
   environment (never from the repo or client code).
3. The Worker calls `https://api.github.com/users/ashfaq8121/repos?sort=updated&per_page=10`
   with the token in the `Authorization` header.
4. On success, the Worker filters out any forked repositories and maps the response down to
   only the fields the frontend needs: name, description, url, stars, language, updatedAt.
5. The response is sent back with `Cache-Control: public, max-age=300`, so Cloudflare's edge
   caches it for 5 minutes — repeated requests in that window don't hit GitHub again.
6. If the GitHub call fails for any reason (network error, rate limit, non-200 status), the
   Worker catches it, logs the error server-side, and returns a `503` with an empty `repos`
   array and a friendly error message — so the calling page can still render something
   sensible instead of crashing.

## Request Flow — GET /api/posts

1. Browser or external client sends `GET /api/posts`.
2. The Worker reads the in-repo post data, filters out any drafts, and sorts by publish date
   (newest first).
3. Each post is mapped to a JSON-friendly shape (slug, title, description, pubDate, tags,
   minutesRead, url) and returned with a `200` status.
4. If something unexpected goes wrong while building the response, the Worker catches it and
   returns a `500` with a consistent error shape.

## Request Flow — GET /api/posts/:slug

1. Browser or external client sends `GET /api/posts/some-slug`.
2. The Worker reads the `slug` route parameter. If it's missing, it returns `400`
   (this shouldn't normally happen since the route requires it, but it's handled defensively).
3. The Worker searches the post data for a matching, non-draft slug.
4. If found, it returns `200` with the full post including the long-form `content` (intro,
   points, closing) — this is the richer payload compared to the list endpoint.
5. If not found, it returns `404` with `{ ok: false, error: "Post not found." }` — this is
   treated as a normal, expected outcome rather than a server error.

## Why the Posts API Has Its Own Data Copy

The blog post data is intentionally duplicated between the page-rendering files
(`src/pages/blog/index.astro`, `src/pages/blog/[slug].astro`) and the API files
(`src/pages/api/posts.ts`, `src/pages/api/posts/[slug].ts`) rather than sharing one module.
This was a deliberate choice to avoid touching the existing, working blog pages while building
the API layer — see `DECISIONS.md` for the trade-off this creates and what would change it.

## Secrets

`GITHUB_TOKEN` is stored as a Cloudflare Workers secret via `wrangler secret put GITHUB_TOKEN`.
It is read server-side only, via `cfEnv.GITHUB_TOKEN`, and never appears in the repository, in
any client-side bundle, or in this documentation.
