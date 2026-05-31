import { defineCollection, z } from "astro:content";

const blog = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    minutesRead: z.number().optional(),
    ogImage: z.string().optional(),
  }),
});

const projects = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string(),       // short card description
    tags: z.array(z.string()),
    order: z.number().default(99), // display order on the page
    githubUrl: z.string().url().optional(),
    liveUrl: z.string().url().optional(),
    screenshotAlt: z.string().optional(),
  }),
});

export const collections = { blog, projects };
