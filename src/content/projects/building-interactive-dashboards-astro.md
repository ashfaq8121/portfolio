---
title: "Building Interactive Dashboards with Astro and React Islands"
description: "How to leverage Astro's partial hydration to build lightning-fast analytics dashboards without sacrificing interactivity where you need it."
pubDate: 2026-05-15
tags: ["Web Dev", "Astro", "React", "Dashboards"]
minutesRead: 12
draft: false
---

Analytics dashboards have a conflicted personality. Most of the page is static — headings, labels, layout — but a few components need to be alive: charts that respond to filters, date pickers that update data, tables you can sort. Most frameworks resolve this conflict by hydrating everything. Astro resolves it differently, and for dashboards, it makes a real difference.

## The Problem with Full Hydration

In React or Vue, your entire page becomes a client-side application. Every component ships JavaScript, hydrates on load, and re-renders as state changes. For a dashboard with 20 components, 18 of which never change, you're paying a JavaScript cost you don't need.

This shows up as slower time-to-interactive, larger bundles, and unnecessary re-renders.

## Astro's Islands Architecture

Astro treats your page as a static document by default. Components render to HTML at build time. If a component needs to be interactive — it handles clicks, fetches data, or responds to user input — you opt in explicitly with a directive.

```astro
---
import StaticHeader from "../components/StaticHeader.astro";
import RevenueChart from "../components/RevenueChart.jsx";
import FilterBar from "../components/FilterBar.jsx";
import SummaryTable from "../components/SummaryTable.astro";
---

<StaticHeader />        <!-- Zero JS, pure HTML -->
<FilterBar client:load />   <!-- Hydrates immediately -->
<RevenueChart client:visible />  <!-- Hydrates when scrolled into view -->
<SummaryTable />        <!-- Zero JS, pure HTML -->
```

Only `FilterBar` and `RevenueChart` ship JavaScript. The rest is plain HTML.

## The Hydration Directives

Astro gives you fine control over when and how islands hydrate:

- **`client:load`** — Hydrates immediately on page load. Use for components the user will interact with right away (filter bars, date pickers).
- **`client:visible`** — Hydrates when the element enters the viewport. Great for charts below the fold.
- **`client:idle`** — Hydrates when the browser is idle. Good for less critical interactive elements.
- **`client:media`** — Hydrates based on a media query. Useful for mobile-only or desktop-only widgets.

## Building a Filter Bar Island

Here's a practical example: a filter bar that manages which data the charts show.

```jsx
// FilterBar.jsx
import { useState } from "react";

export default function FilterBar({ onFilterChange }) {
  const [range, setRange] = useState("30d");
  const [region, setRegion] = useState("all");

  const handleChange = (newRange, newRegion) => {
    setRange(newRange);
    setRegion(newRegion);
    onFilterChange({ range: newRange, region: newRegion });
  };

  return (
    <div className="filter-bar">
      <select value={range} onChange={(e) => handleChange(e.target.value, region)}>
        <option value="7d">Last 7 days</option>
        <option value="30d">Last 30 days</option>
        <option value="90d">Last 90 days</option>
      </select>
      <select value={region} onChange={(e) => handleChange(range, e.target.value)}>
        <option value="all">All regions</option>
        <option value="us">United States</option>
        <option value="eu">Europe</option>
      </select>
    </div>
  );
}
```

## Sharing State Between Islands

Islands are isolated by default. If your filter bar and your chart are separate islands, you need a way to share state between them. Options include:

**Nano Stores** (Astro's recommended solution):

```js
// stores/filters.js
import { atom } from "nanostores";
export const activeFilters = atom({ range: "30d", region: "all" });
```

```jsx
// FilterBar.jsx
import { useStore } from "@nanostores/react";
import { activeFilters } from "../stores/filters";

export default function FilterBar() {
  const filters = useStore(activeFilters);
  return (
    <select
      value={filters.range}
      onChange={(e) => activeFilters.set({ ...filters, range: e.target.value })}
    >
      ...
    </select>
  );
}
```

```jsx
// RevenueChart.jsx
import { useStore } from "@nanostores/react";
import { activeFilters } from "../stores/filters";

export default function RevenueChart() {
  const { range, region } = useStore(activeFilters);
  // fetch and render chart based on filters
}
```

## Data Fetching Strategies

For dashboards, data fetching deserves its own thought. Three patterns work well in Astro:

1. **Build-time fetch** — Data is fetched at build time and baked into HTML. Fast, but only works for data that doesn't change per request.
2. **Server-side fetch** — Use Astro's server mode (`output: "server"`) to fetch data on each request before rendering. Good for user-specific dashboards.
3. **Client-side fetch** — The island fetches data itself using `fetch()` or a library like SWR. Necessary when data changes based on user interaction.

For a filter-driven dashboard, you'll usually combine approaches: static layout at build time, client-side data fetching inside interactive islands when filters change.

## Performance Results

A dashboard I recently migrated from a full React SPA to Astro islands saw:

- **JS bundle size**: 340 KB → 62 KB (only the interactive components)
- **Time to interactive**: ~3.2s → ~0.8s
- **Largest Contentful Paint**: improved by ~40%

The layout, headers, and summary statistics were plain HTML — they appeared instantly.

## When This Pattern Works Best

Astro islands suit dashboards where the majority of the page is content with a handful of interactive components. If almost every element on your page is interactive — live-updating charts, collaborative features, real-time data — a full SPA framework is probably a better fit.

But for most internal analytics tools, reporting dashboards, and data summary pages, the islands pattern gives you a much lighter result.
