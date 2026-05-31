---
title: "D3.js Fundamentals: From Data to Visual Storytelling"
description: "Stop fighting with D3. Learn the core pattern—selections, data binding, and scales—to build custom visualizations that actually make sense."
pubDate: 2026-04-12
tags: ["Data Analysis", "D3.js", "JavaScript", "Visualization"]
minutesRead: 15
draft: false
---

D3.js has a reputation for being hard to learn. That reputation is partly deserved and partly the result of how it's usually taught — through dense examples full of method chains that look like magic until you understand the underlying model. This post is about that model.

Once you internalize three concepts — selections, data binding, and scales — D3 starts to feel logical rather than arcane.

## What D3 Actually Does

D3 doesn't draw charts. It doesn't have a `BarChart()` function. What it does is give you precise control over DOM elements based on data. You write the mapping from data to visual properties, and D3 handles the mechanics.

This is why D3 is so flexible and so verbose. You're not configuring a chart — you're programming a visualization.

## Concept 1: Selections

A D3 selection is a wrapper around one or more DOM elements that lets you set attributes, styles, and text in bulk.

```js
import * as d3 from "d3";

// Select a single element
d3.select("#chart");

// Select all matching elements
d3.selectAll("circle");

// Chain methods to modify elements
d3.selectAll("p")
  .style("color", "steelblue")
  .style("font-size", "14px")
  .text("Hello from D3");
```

This is conceptually similar to jQuery's `$()`. The power comes when you combine selections with data.

## Concept 2: Data Binding

The `data()` method joins an array of data to a selection of DOM elements. After binding, each element in the selection knows its corresponding datum.

```js
const data = [10, 40, 25, 60, 15];

const bars = d3.select("svg")
  .selectAll("rect")
  .data(data);
```

After `.data(data)`, `bars` has three sub-selections:

- **`bars.enter()`** — data items that have no matching DOM element yet (need to be created)
- **`bars` (update)** — data items with existing DOM elements (can be updated)
- **`bars.exit()`** — DOM elements with no matching data item (can be removed)

For most static charts, you only need `.enter()`:

```js
bars.enter()
  .append("rect")
  .attr("x", (d, i) => i * 40)
  .attr("y", (d) => 200 - d * 2)
  .attr("width", 35)
  .attr("height", (d) => d * 2)
  .attr("fill", "steelblue");
```

Notice how the attribute callbacks receive `d` (the datum) and `i` (the index). This is how data drives the visual.

## Concept 3: Scales

A scale is a function that maps a value from one range (the domain) to another (the range). Scales handle the translation from data units to pixel units.

```js
// Linear scale: maps data values to pixel heights
const yScale = d3.scaleLinear()
  .domain([0, 100])   // data range
  .range([400, 0]);   // pixel range (inverted: SVG y=0 is top)

yScale(50);  // → 200 (50% of the pixel range)
yScale(0);   // → 400 (bottom of the chart)
yScale(100); // → 0   (top of the chart)

// Band scale: maps categories to evenly-spaced bands
const xScale = d3.scaleBand()
  .domain(["Jan", "Feb", "Mar", "Apr"])
  .range([0, 500])
  .padding(0.1);

xScale("Feb");       // → some pixel x position
xScale.bandwidth();  // → width of each band
```

Using scales instead of hardcoded pixel math means your chart adapts automatically when data or dimensions change.

## Putting It Together: A Complete Bar Chart

```js
const data = [
  { month: "Jan", value: 42 },
  { month: "Feb", value: 68 },
  { month: "Mar", value: 55 },
  { month: "Apr", value: 81 },
  { month: "May", value: 74 },
];

const width = 500;
const height = 300;
const margin = { top: 20, right: 20, bottom: 30, left: 40 };
const innerWidth = width - margin.left - margin.right;
const innerHeight = height - margin.top - margin.bottom;

// Scales
const xScale = d3.scaleBand()
  .domain(data.map((d) => d.month))
  .range([0, innerWidth])
  .padding(0.2);

const yScale = d3.scaleLinear()
  .domain([0, d3.max(data, (d) => d.value)])
  .range([innerHeight, 0]);

// SVG container
const svg = d3.select("#chart")
  .append("svg")
  .attr("width", width)
  .attr("height", height)
  .append("g")
  .attr("transform", `translate(${margin.left},${margin.top})`);

// Bars
svg.selectAll("rect")
  .data(data)
  .enter()
  .append("rect")
  .attr("x", (d) => xScale(d.month))
  .attr("y", (d) => yScale(d.value))
  .attr("width", xScale.bandwidth())
  .attr("height", (d) => innerHeight - yScale(d.value))
  .attr("fill", "steelblue");

// Axes
svg.append("g")
  .attr("transform", `translate(0,${innerHeight})`)
  .call(d3.axisBottom(xScale));

svg.append("g")
  .call(d3.axisLeft(yScale));
```

Every decision — where bars are, how tall, how wide — flows from the data through the scales. Change the data, and everything recalculates.

## The Enter-Update-Exit Pattern

For dynamic visualizations that change over time, you need all three sub-selections:

```js
function update(newData) {
  const bars = svg.selectAll("rect").data(newData);

  // Enter: add new bars
  bars.enter()
    .append("rect")
    .attr("fill", "steelblue")
    .merge(bars) // merge with update selection
    .transition()
    .duration(500)
    .attr("x", (d) => xScale(d.month))
    .attr("y", (d) => yScale(d.value))
    .attr("width", xScale.bandwidth())
    .attr("height", (d) => innerHeight - yScale(d.value));

  // Exit: remove old bars
  bars.exit()
    .transition()
    .duration(500)
    .attr("height", 0)
    .attr("y", innerHeight)
    .remove();
}
```

## When to Use D3 vs. a Chart Library

D3 is the right choice when you need a visualization type that charting libraries don't support, or when you need pixel-perfect control over every aspect of the output. For a custom force-directed network graph, a radial tree, or a geographic choropleth — D3.

For a standard bar chart, line chart, or pie chart on a product dashboard — a library like Recharts, Chart.js, or Observable Plot will get you there in a fraction of the code.

D3's real value is at the boundary between what chart libraries can do and what your design actually requires.
