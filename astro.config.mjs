import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

const rawSite = process.env.SITE_URL || 'https://upack-trading.github.io';
const rawBase = process.env.BASE_PATH || '/';
const normalizedBase = rawBase.startsWith('/') ? rawBase : `/${rawBase}`;

export default defineConfig({
  site: rawSite,
  base: normalizedBase,
  output: 'static',
  trailingSlash: 'always',
  prefetch: {
    defaultStrategy: 'hover',
  },
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [
    sitemap({
      i18n: {
        defaultLocale: 'ar',
        locales: {
          ar: 'ar-EG',
          en: 'en-EG',
        },
      },
    }),
  ],
});
