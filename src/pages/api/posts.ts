import type { APIRoute } from "astro";

export const prerender = false;

interface PostSummary {
  slug: string;
  title: string;
  description: string;
  pubDate: string;
  tags: string[];
  minutesRead: number;
  draft?: boolean;
}

// Mirrors the same posts shown on /blog — kept here so this API
// works independently without touching the existing blog pages.
const posts: PostSummary[] = [
  {
    slug: "nyc-taxi-dashboard-lessons",
    title: "What I Learned from Building an NYC Taxi Dashboard",
    description:
      "A short write-up on how I turned raw taxi trip data into a simple Power BI dashboard with useful business insights.",
    pubDate: "2026-06-01",
    tags: ["Power BI", "Data Analysis", "Dashboard"],
    minutesRead: 3,
  },
  {
    slug: "sales-dashboard-small-business",
    title: "How I Built a Sales Dashboard for Better Business Decisions",
    description:
      "A simple case study on building a Power BI sales dashboard to track profit, products, states, and payment trends.",
    pubDate: "2026-05-30",
    tags: ["Power BI", "Sales Analytics", "Dashboard"],
    minutesRead: 3,
  },
  {
    slug: "dental-clinic-booking-website",
    title: "Building a Simple Dental Clinic Booking Website",
    description:
      "How I created a clean static website that helps patients book appointments and contact the clinic more easily.",
    pubDate: "2026-05-28",
    tags: ["HTML", "CSS", "JavaScript", "Formspree"],
    minutesRead: 2,
  },
];

export const GET: APIRoute = async () => {
  try {
    const publishedPosts = posts
      .filter((p) => !p.draft)
      .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
      .map((p) => ({
        slug: p.slug,
        title: p.title,
        description: p.description,
        pubDate: p.pubDate,
        tags: p.tags,
        minutesRead: p.minutesRead,
        url: `/blog/${p.slug}`,
      }));

    return new Response(JSON.stringify({ ok: true, posts: publishedPosts }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("Posts API error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: "Could not fetch posts." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
