# HLD.md — Extension 2: API & Integration

## Where This Fits

Extension 1 built the backend (contact form, D1 storage, admin dashboard). Extension 2 exposes
that data — and external data — through clean, documented JSON APIs that anyone (a person,
script, or AI agent) can call without guessing how the system works.

## Components Added

| Component | File | Responsibility |
|---|---|---|
| GitHub repos API | `src/pages/api/github.ts` | Calls the GitHub REST API for public repos, filters out forks, caches the response, returns a clean JSON shape |
| Blog posts list API | `src/pages/api/posts.ts` | Returns all published blog posts as JSON |
| Blog post by slug API | `src/pages/api/posts/[slug].ts` | Returns one blog post's full content by slug, or a 404 if it doesn't exist |
| OpenAPI spec | `openapi.yaml` | Documents the contract for all three endpoints — request shape, response shape, status codes |

## Component Diagram

```mermaid
graph TD
    Visitor[Visitor / External Client] -->|GET /api/posts| Worker[Cloudflare Worker]
    Visitor -->|GET /api/posts/:slug| Worker
    Visitor -->|GET /api/github| Worker

    Worker -->|reads| PostsData[Blog Post Data]
    Worker -->|fetch with GITHUB_TOKEN secret| GitHubAPI[GitHub REST API]

    GitHubAPI -->|200 repo list / error| Worker
    Worker -->|JSON response| Visitor
```

## Data Stores & External Services

| Store / Service | Used For |
|---|---|
| Blog post data (in-repo) | Source of truth for `/api/posts` and `/api/posts/:slug` |
| GitHub REST API | Live repository data, fetched fresh on each request (subject to edge caching) |
| Cloudflare Cache-Control header | Caches the GitHub response for 5 minutes at the edge to reduce external calls |
| Wrangler secret (`GITHUB_TOKEN`) | Authenticates the GitHub API call without ever touching the repo or client code |

## Sequence Diagram — GET /api/github (external integration + fallback)

```mermaid
sequenceDiagram
    participant Browser
    participant Worker
    participant GitHubAPI as GitHub REST API

    Browser->>Worker: GET /api/github
    Worker->>GitHubAPI: fetch /users/ashfaq8121/repos (with token)
    alt GitHub API responds successfully
        GitHubAPI-->>Worker: 200 OK + repo list
        Worker->>Worker: filter forks, map to clean shape
        Worker-->>Browser: 200 OK + { ok: true, repos: [...] }
    else GitHub API fails, times out, or rate-limits
        GitHubAPI-->>Worker: error / non-200 response
        Worker->>Worker: catch error, log server-side
        Worker-->>Browser: 503 + { ok: false, repos: [], error: "..." }
    end
    Browser->>Browser: render repo list, or fallback message if ok is false
```

## Sequence Diagram — GET /api/posts/:slug

```mermaid
sequenceDiagram
    participant Client as Client (browser, curl, or other app)
    participant Worker

    Client->>Worker: GET /api/posts/my-slug
    Worker->>Worker: look up slug in post data
    alt Post exists and is published
        Worker-->>Client: 200 OK + { ok: true, post: {...} }
    else Post not found or is a draft
        Worker-->>Client: 404 + { ok: false, error: "Post not found." }
    end
```

## Failure Handling Summary

If the GitHub API is slow or down, the page does not break — `/api/github` degrades to an empty
repo list with a clear error message and a `503` status, rather than throwing an unhandled
exception. Blog post lookups treat a missing slug as a normal, expected `404` rather than an
error condition, since "this post doesn't exist" is a valid outcome of a lookup.
