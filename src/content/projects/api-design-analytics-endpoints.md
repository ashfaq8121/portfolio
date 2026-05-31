---
title: "Designing REST APIs for Analytics: Lessons from Real Projects"
description: "Why your analytics endpoints are slow and how to fix them. Covering aggregation strategies, caching, and query parameter design."
pubDate: 2026-03-22
tags: ["Web Dev", "API Design", "Backend", "Performance"]
minutesRead: 10
draft: false
---

Analytics APIs are a specific category of backend work that most REST API design guides don't cover well. The usual advice — keep resources focused, use standard HTTP verbs, return consistent shapes — is still valid, but it misses the challenges that make analytics endpoints uniquely difficult: slow aggregations, high query cost, and dashboard clients that fire many requests at once.

These are lessons from building and fixing analytics APIs across a handful of real projects.

## Why Analytics Endpoints Get Slow

The most common cause is computing everything on demand. A request comes in for "monthly revenue by region for the last 12 months," and the API issues a `GROUP BY` query against a transactions table with 50 million rows. Every request.

This works fine in development with 10,000 rows. It falls over in production.

The fix isn't always obvious because the query itself may be correct and well-indexed. The issue is architectural: you're treating an aggregation like a lookup.

## Strategy 1: Pre-Aggregation

Move expensive aggregations out of the request path and into a scheduled job. The API reads from a summary table; the job keeps it fresh.

```sql
-- Summary table, updated every hour
CREATE TABLE revenue_by_region_monthly (
  region       TEXT,
  month        DATE,
  total_revenue NUMERIC,
  order_count  INT,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Fast API query
SELECT region, month, total_revenue, order_count
FROM revenue_by_region_monthly
WHERE month >= date_trunc('month', NOW() - INTERVAL '12 months')
ORDER BY month DESC, total_revenue DESC;
```

Dashboards get sub-100ms responses. The data is an hour old at most, which is usually fine for an analytics use case.

When data must be fresh, pre-aggregate to recent time windows and fall back to on-demand computation only for the most recent period.

## Strategy 2: Query Parameter Design

Analytics dashboards send heavily filtered requests. Your API needs a clean, consistent way to express time ranges, dimensions, and granularity without becoming a custom query language.

A pattern that works well:

```
GET /api/analytics/revenue?
  from=2026-01-01&
  to=2026-03-31&
  granularity=week&
  region=us,eu&
  breakdown=product_category
```

Guidelines:

- **`from` / `to`** in ISO 8601 (`YYYY-MM-DD`). Avoid relative strings like `"last30days"` — they create timezone ambiguity and are harder to cache.
- **`granularity`** should be an explicit enum: `day`, `week`, `month`, `quarter`. Clients shouldn't need to calculate bucketing.
- **Multi-value filters** with comma-separated values or repeated params (`region=us&region=eu`) — pick one and document it.
- **`breakdown`** for dimension slicing. Keep it to one breakdown per request; multi-dimensional pivots belong in the client or a separate aggregation layer.

## Strategy 3: Response Shape Consistency

Dashboards consume multiple endpoints simultaneously. Inconsistent response shapes mean different parsing logic everywhere.

A consistent envelope:

```json
{
  "data": [
    { "period": "2026-01-01", "value": 48200, "dimension": "us" },
    { "period": "2026-01-01", "value": 31500, "dimension": "eu" }
  ],
  "meta": {
    "from": "2026-01-01",
    "to": "2026-03-31",
    "granularity": "week",
    "total_count": 24,
    "generated_at": "2026-03-22T14:30:00Z"
  }
}
```

`generated_at` in the meta is underrated — it lets clients show users when the data was last computed and helps debug caching issues.

## Strategy 4: HTTP Caching

Analytics data is often the same for many users and changes infrequently. HTTP caching is free performance that most analytics APIs leave on the table.

```
Cache-Control: public, max-age=300, stale-while-revalidate=60
ETag: "a3f4b2c1"
```

For user-specific dashboards, use `private` instead of `public`. For pre-aggregated data served to many users, `public` allows a CDN or shared cache to serve responses without touching your backend.

Set `max-age` to match how frequently your aggregation jobs run. If you update summaries hourly, a `max-age=3600` response is accurate by definition.

## Strategy 5: Pagination and Limits

Analytics queries can return large datasets if clients request long time ranges at fine granularity (daily data for 3 years is over 1,000 rows). Default limits prevent accidental expensive requests.

```json
GET /api/analytics/events?from=2023-01-01&to=2026-01-01&granularity=day

// 400 Bad Request
{
  "error": "date_range_too_large",
  "message": "Daily granularity is limited to 365 days. Use weekly or monthly granularity for longer ranges.",
  "max_days": 365
}
```

Guide clients toward appropriate granularities for long ranges rather than silently truncating or silently timing out.

## The Composite Endpoint Debate

Dashboards often need 5–10 metrics simultaneously. Should you have one endpoint per metric, or a composite endpoint that returns everything in one request?

**Separate endpoints** are easier to cache individually, easier to evolve, and cleaner to reason about. The downside is more round trips.

**Composite endpoints** reduce round trips, which matters on mobile or high-latency connections. The downside: more coupling between client and API, harder to cache granularly.

A middle ground: keep separate endpoints but support a lightweight `/batch` endpoint that accepts an array of requests and parallelizes them server-side:

```json
POST /api/analytics/batch
{
  "requests": [
    { "endpoint": "/revenue", "params": { "from": "2026-01-01", "granularity": "month" } },
    { "endpoint": "/visitors", "params": { "from": "2026-01-01", "granularity": "month" } }
  ]
}
```

This gives clients the performance of a single round trip while the API keeps each metric's logic separate.

## Quick Checklist

- [ ] Pre-aggregate expensive metrics; don't compute on demand for every request
- [ ] Use explicit ISO 8601 dates, not relative strings
- [ ] Define `granularity` as an enum
- [ ] Return consistent `{ data, meta }` envelopes
- [ ] Include `generated_at` in meta
- [ ] Set appropriate `Cache-Control` headers
- [ ] Enforce max date range limits by granularity
- [ ] Document all query parameters and their valid values

Analytics APIs are rarely as glamorous as product APIs, but they're usually on the critical path to every dashboard load. The performance work pays off fast.
