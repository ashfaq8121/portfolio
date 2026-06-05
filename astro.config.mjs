import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server',
  site: 'https://portfolio.ashfaq-portfolio.workers.dev',
  adapter: cloudflare({
    platformProxy: {
      enabled: true,      // ✅ This enables local env bindings
      configPath: 'wrangler.toml', // Optional: tells it where to read config
    }
  })
});