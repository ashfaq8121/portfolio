# Architecture — Extension 2

## Files Added

| File | Purpose |
|---|---|
| `src/pages/api/github.ts` | GET /api/github — calls GitHub REST API, filters forks, returns repo list |
| `src/pages/api/posts.ts` | GET /api/posts — reads Astro content collection, returns all posts |
| `src/pages/api/posts/[slug].ts` | GET /api/posts/:slug — looks up single post, returns 404 if missing |
| `openapi.yaml` | OpenAPI 3.1 spec describing all three endpoints |
| `HLD.md` | High-level design and component diagram |

## Request Flow — GET /api/github

1. Browser requests `GET /api/github`
2. Cloudflare Worker receives request
3. Worker reads `GITHUB_TOKEN` from environment secrets
4. Worker calls `https://api.github.com/users/ashfaq8121/repos`
5. On success → filters forks → maps to clean shape → returns 200 JSON
6. On failure → returns 503 with empty repos array (page still renders)

## Request Flow — GET /api/posts/:slug

1. Browser requests `GET /api/posts/my-post-slug`
2. Worker calls `getEntry("blog", slug)` from Astro content collections
3. If found → returns 200 with post data
4. If not found → returns 404 `{ ok: false, error: "Post not found." }`