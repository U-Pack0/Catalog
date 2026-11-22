import type { APIRoute } from 'astro';
import { absUrl } from '../lib/url';

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const sitemapUrl = absUrl('/sitemap-index.xml', site);
  const body = `User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n`;
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};
