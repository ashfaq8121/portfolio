import rss from '@astrojs/rss';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const posts = [
    {
      title: "What I Learned from Building an NYC Taxi Dashboard",
      description: "A short write-up on how I turned raw taxi trip data into a simple Power BI dashboard with useful business insights.",
      pubDate: new Date("2026-06-01"),
      slug: "nyc-taxi-dashboard-lessons",
    },
    {
      title: "How I Built a Sales Dashboard for Better Business Decisions",
      description: "A simple case study on building a Power BI sales dashboard to track profit, products, states, and payment trends.",
      pubDate: new Date("2026-05-30"),
      slug: "sales-dashboard-small-business",
    },
    {
      title: "Building a Simple Dental Clinic Booking Website",
      description: "How I created a clean static website that helps patients book appointments and contact the clinic more easily.",
      pubDate: new Date("2026-05-28"),
      slug: "dental-clinic-booking-website",
    },
  ];

  return rss({
    title: 'Ashfaq ur Rahman — Blog',
    description: 'Short articles based on real projects I have built.',
    site: context.site!,
    items: posts.map((post) => ({
      title: post.title,
      pubDate: post.pubDate,
      description: post.description,
      link: `/blog/${post.slug}/`,
    })),
    customData: `<language>en-us</language>`,
  });
}