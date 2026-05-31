---
title: "Astro Content Collections: Type-Safe Blogging Without the Headache"
description: "How I migrated from a CMS to Astro's built-in content collections and why the type safety and local markdown workflow won me over."
pubDate: 2026-02-18
tags: ["Web Dev", "Astro", "TypeScript", "CMS"]
minutesRead: 7
draft: false
---

I ran this blog on a headless CMS for about a year. The editing experience was fine, the API was reliable, but something about it felt off for a developer blog. Writing in a browser editor, copy-pasting code blocks, previewing in a different tab — it added friction in all the wrong places.

Astro's Content Collections removed that friction. Here's what the migration looked like and why it stuck.

## What Content Collections Are

Content Collections is Astro's built-in system for managing local Markdown (or MDX) files. You define a schema for your content using Zod, and Astro validates every file against it at build time — with full TypeScript types generated automatically.

The result: your frontmatter is type-safe, build errors surface missing required fields, and your editor autocompletes content properties.

## Setting Up a Collection

Content lives in the `src/content/` directory. Each subdirectory is a collection.

```
src/
  content/
    blog/
      my-first-post.md
      second-post.md
    config.ts
```

The `config.ts` file defines your schemas:

```ts
// src/content/config.ts
import { defineCollection, z } from "astro:content";

const blog = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    minutesRead: z.number().optional(),
    draft: z.boolean().default(false),
    ogImage: z.string().optional(),
  }),
});

export const collections = { blog };
```

Zod handles validation and coercion. `z.coerce.date()` converts date strings in frontmatter to `Date` objects automatically.

## Writing a Post

A blog post is just a Markdown file with frontmatter:

```md
---
title: "My Post Title"
description: "A short description."
pubDate: 2026-02-18
tags: ["Astro", "TypeScript"]
minutesRead: 7
---

Post content goes here, with full Markdown and (if using MDX) component support.
```

If `title` is missing, the build fails with a clear error message pointing to the file. No more silent empty fields.

## Querying Collections in Pages

```astro
---
// src/pages/blog/index.astro
import { getCollection } from "astro:content";

const allPosts = await getCollection("blog", ({ data }) => !data.draft);
const sorted = allPosts.sort(
  (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf()
);
---

{sorted.map((post) => (
  <article>
    <a href={`/blog/${post.slug}`}>{post.data.title}</a>
    <p>{post.data.description}</p>
  </article>
))}
```

`getCollection` returns fully-typed entries. `post.data` is inferred from your Zod schema, so your editor knows every field and its type.

## Dynamic Routes with getStaticPaths

For individual post pages:

```astro
---
// src/pages/blog/[slug].astro
import { getCollection } from "astro:content";

export async function getStaticPaths() {
  const posts = await getCollection("blog", ({ data }) => !data.draft);
  return posts.map((post) => ({
    params: { slug: post.slug },
    props: { post },
  }));
}

const { post } = Astro.props;
const { Content } = await post.render();
---

<h1>{post.data.title}</h1>
<Content />
```

`post.render()` compiles the Markdown to a component you drop directly into your layout. Code blocks, headings, links — all handled.

## MDX for Interactive Posts

If you want to use components inside posts, switch to MDX:

```ts
// src/content/config.ts
const blog = defineCollection({
  type: "content", // works for both .md and .mdx
  schema: z.object({ ... }),
});
```

Then in a post:

```mdx
---
title: "Interactive Example"
---

import Chart from "../../components/Chart.jsx";

Here's the data visualized:

<Chart data={[10, 40, 25, 60]} />
```

MDX is opt-in per file — `.md` files don't pay any MDX overhead.

## What I Gave Up (and Gained)

**Gave up:**
- A web editor for writing posts
- Non-technical collaborators being able to write posts without Git
- Remote content accessible from multiple environments

**Gained:**
- Writing in VS Code with my usual extensions
- Frontmatter validation that catches errors before deployment
- Full TypeScript types on all content properties
- Zero API calls at build or runtime — content is just files
- Git history for every post change
- Easy local preview without network dependency

For a solo developer blog, this trade is straightforward. For a team with non-technical writers, a CMS is still the right call — but the Content Collections model makes that a genuine tradeoff rather than a default.

## The Migration

The actual migration was a few hours: export all CMS content to Markdown, clean up the frontmatter fields to match the schema, move files into `src/content/blog/`, and swap the data-fetching calls from API requests to `getCollection`.

The code got simpler. Pages that used to handle API errors, loading states, and empty responses now just call `getCollection` and map over results.

If you're running an Astro blog and still managing content through a separate service, it's worth at least prototyping the migration. The type safety alone is worth the switch for a developer-authored blog.
