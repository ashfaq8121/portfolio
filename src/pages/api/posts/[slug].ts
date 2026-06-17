import type { APIRoute } from "astro";

export const prerender = false;

interface PostFull {
  slug: string;
  title: string;
  description: string;
  pubDate: string;
  tags: string[];
  minutesRead: number;
  draft?: boolean;
  content: {
    intro: string;
    points: string[];
    closing: string;
  };
}

// Mirrors the same posts shown on /blog/:slug — kept here so this API
// works independently without touching the existing blog pages.
const posts: PostFull[] = [
  {
    slug: "nyc-taxi-dashboard-lessons",
    title: "What I Learned from Building an NYC Taxi Dashboard",
    description:
      "A short write-up on how I turned raw taxi trip data into a simple Power BI dashboard with useful business insights.",
    pubDate: "2026-06-01",
    tags: ["Power BI", "Data Analysis", "Dashboard"],
    minutesRead: 3,
    content: {
      intro:
        "This project started with a simple problem: NYC taxi trip data contains a lot of useful information, but it is hard to understand by looking at rows in a table.",
      points: [
        "I used Power BI to turn the raw data into charts that show trip distance trends, fare breakdowns, payment methods, and popular pickup and dropoff locations.",
        "One thing I found interesting was how much easier it becomes to explain data when the dashboard is visual and interactive instead of just numbers in a spreadsheet.",
        "This project helped me practice data cleaning, dashboard design, and choosing visuals that answer real questions clearly.",
      ],
      closing:
        "The biggest lesson from this project was that a good dashboard should not just look nice — it should help people make faster and better decisions.",
    },
  },
  {
    slug: "sales-dashboard-small-business",
    title: "How I Built a Sales Dashboard for Better Business Decisions",
    description:
      "A simple case study on building a Power BI sales dashboard to track profit, products, states, and payment trends.",
    pubDate: "2026-05-30",
    tags: ["Power BI", "Sales Analytics", "Dashboard"],
    minutesRead: 3,
    content: {
      intro:
        "I built this project to show how dashboarding can help a small business understand sales performance without spending hours in Excel.",
      points: [
        "The dashboard combines product, payment, profit, and state-wise sales data in one place so the user can quickly see what is performing well.",
        "I added filters and summary visuals so it becomes easy to compare periods, find top-selling products, and spot low-performing areas.",
        "This project improved my ability to design business-focused dashboards that are simple, useful, and easy to read.",
      ],
      closing:
        "What I liked most about this project is that it turns messy business data into something practical that supports everyday decisions.",
    },
  },
  {
    slug: "dental-clinic-booking-website",
    title: "Building a Simple Dental Clinic Booking Website",
    description:
      "How I created a clean static website that helps patients book appointments and contact the clinic more easily.",
    pubDate: "2026-05-28",
    tags: ["HTML", "CSS", "JavaScript", "Formspree"],
    minutesRead: 2,
    content: {
      intro:
        "This project was built for a small dental clinic that needed a simple online presence and an easier way for patients to book appointments.",
      points: [
        "I created a clean static website using HTML, CSS, and JavaScript, and connected the booking form with Formspree for email notifications.",
        "I also added a WhatsApp contact option so patients can quickly message the clinic without making a phone call.",
        "This project showed me that even a simple website can solve real business problems when it is clear, fast, and easy to use.",
      ],
      closing:
        "The main lesson from this project is that small businesses often do not need complex systems first — they need simple tools that work well.",
    },
  },
];

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug;

  if (!slug) {
    return new Response(
      JSON.stringify({ ok: false, error: "Slug is required." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const post = posts.find((p) => p.slug === slug && !p.draft);

    if (!post) {
      return new Response(
        JSON.stringify({ ok: false, error: "Post not found." }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        post: {
          slug: post.slug,
          title: post.title,
          description: post.description,
          pubDate: post.pubDate,
          tags: post.tags,
          minutesRead: post.minutesRead,
          url: `/blog/${post.slug}`,
          content: post.content,
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err) {
    console.error("Post slug API error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: "Could not fetch post." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};