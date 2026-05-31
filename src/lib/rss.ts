/**
 * rss.ts
 *
 * Helpers for generating the RSS feed. The actual /rss.xml endpoint
 * is in src/pages/rss.xml.ts; these utilities live here so they can
 * be tested independently.
 */

export interface RssItem {
  title: string;
  description: string;
  pubDate: Date;
  link: string;
}

/**
 * Sort a list of RSS items by publication date, newest first.
 */
export function sortByDate(items: RssItem[]): RssItem[] {
  return [...items].sort(
    (a, b) => b.pubDate.valueOf() - a.pubDate.valueOf()
  );
}

/**
 * Escape XML special characters in a string.
 * Used when building raw XML strings in tests.
 */
export function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
