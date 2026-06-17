import type { APIRoute } from "astro";
import { env as cfEnv } from "cloudflare:workers";

export const prerender = false;

const CACHE_TTL = 300; // cache for 5 minutes

export const GET: APIRoute = async () => {
  const token = (cfEnv as any).GITHUB_TOKEN;

  try {
    const res = await fetch(
      "https://api.github.com/users/ashfaq8121/repos?sort=updated&per_page=10",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "ashfaq-portfolio",
        },
      }
    );

    if (!res.ok) {
      throw new Error(`GitHub API responded with ${res.status}`);
    }

    const repos = (await res.json()) as any[];

    // Only return the fields we need
    const data = repos
      .filter((r) => !r.fork) // exclude forked repos
      .map((r) => ({
        name: r.name,
        description: r.description,
        url: r.html_url,
        stars: r.stargazers_count,
        language: r.language,
        updatedAt: r.updated_at,
      }));

    return new Response(JSON.stringify({ ok: true, repos: data }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${CACHE_TTL}`,
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("GitHub API error:", err);

    // Graceful fallback — return empty array, don't break the page
    return new Response(
      JSON.stringify({
        ok: false,
        repos: [],
        error: "Could not fetch repositories. Please try again later.",
      }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
};