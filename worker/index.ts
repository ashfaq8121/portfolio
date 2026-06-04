import { handleContact, Env } from "./api/contact";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/contact") {
      return handleContact(request, env);
    }

    // Pass everything else to Astro static assets
    if ("ASSETS" in env) {
      return (env as any).ASSETS.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;