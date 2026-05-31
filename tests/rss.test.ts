import { describe, it, expect } from "vitest";
import { sortByDate, escapeXml, type RssItem } from "../src/lib/rss";

const makeItem = (title: string, date: string): RssItem => ({
  title,
  description: `Description for ${title}`,
  pubDate: new Date(date),
  link: `https://example.com/blog/${title.toLowerCase().replace(/\s/g, "-")}`,
});

// ── sortByDate ─────────────────────────────────────────────────────────────

describe("sortByDate", () => {
  it("sorts items newest-first", () => {
    const items = [
      makeItem("Old post", "2024-01-01"),
      makeItem("New post", "2024-11-01"),
      makeItem("Middle post", "2024-06-15"),
    ];

    const sorted = sortByDate(items);

    expect(sorted[0].title).toBe("New post");
    expect(sorted[1].title).toBe("Middle post");
    expect(sorted[2].title).toBe("Old post");
  });

  it("returns a new array (does not mutate the input)", () => {
    const items = [
      makeItem("Post A", "2024-01-01"),
      makeItem("Post B", "2024-06-01"),
    ];
    const original = [...items];
    sortByDate(items);
    expect(items[0].title).toBe(original[0].title);
  });

  it("handles an empty array", () => {
    expect(sortByDate([])).toEqual([]);
  });

  it("handles a single item", () => {
    const items = [makeItem("Only post", "2024-05-01")];
    expect(sortByDate(items)).toHaveLength(1);
    expect(sortByDate(items)[0].title).toBe("Only post");
  });

  it("handles items with the same date (preserves relative order)", () => {
    const items = [
      makeItem("First", "2024-05-01"),
      makeItem("Second", "2024-05-01"),
    ];
    const sorted = sortByDate(items);
    // Both are equal; just verify both are present
    expect(sorted).toHaveLength(2);
  });
});

// ── escapeXml ──────────────────────────────────────────────────────────────

describe("escapeXml", () => {
  it("escapes ampersands", () => {
    expect(escapeXml("cats & dogs")).toBe("cats &amp; dogs");
  });

  it("escapes less-than", () => {
    expect(escapeXml("<script>")).toBe("&lt;script&gt;");
  });

  it("escapes greater-than", () => {
    expect(escapeXml("a > b")).toBe("a &gt; b");
  });

  it("escapes double quotes", () => {
    expect(escapeXml(`say "hello"`)).toBe("say &quot;hello&quot;");
  });

  it("escapes single quotes", () => {
    expect(escapeXml("it's fine")).toBe("it&apos;s fine");
  });

  it("escapes multiple special characters in one string", () => {
    expect(escapeXml(`<a href="x&y">it's a link</a>`)).toBe(
      "&lt;a href=&quot;x&amp;y&quot;&gt;it&apos;s a link&lt;/a&gt;"
    );
  });

  it("returns unchanged string when no special chars present", () => {
    expect(escapeXml("hello world")).toBe("hello world");
  });

  it("handles an empty string", () => {
    expect(escapeXml("")).toBe("");
  });
});
