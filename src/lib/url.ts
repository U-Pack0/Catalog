export type Lang = 'en' | 'ar';

export const DEFAULT_SITE = 'https://upack-trading.github.io';

/**
 * Returns normalized base path always starting with "/" and ending with "/".
 * Works cleanly both at custom domain "/" and GitHub Pages subpath "/<repo>/".
 */
export function getBasePath(): string {
  const raw = import.meta.env.BASE_URL || '/';
  const leading = raw.startsWith('/') ? raw : `/${raw}`;
  return leading.endsWith('/') ? leading : `${leading}/`;
}

/**
 * Prepends Astro's configured BASE_PATH to any internal route or public asset path.
 * Passes external URLs (http/https/mailto/tel) and pure hash anchors through untouched.
 */
export function withBase(path: string): string {
  if (!path) return getBasePath();
  if (/^(https?:|mailto:|tel:|data:|#)/i.test(path)) return path;

  const base = getBasePath();
  const clean = path.replace(/^\/+/, '');
  if (!clean) return base;

  // Avoid double-prefixing if path already begins with the base segment
  const baseNoLead = base.replace(/^\/+/, '');
  if (baseNoLead && clean.startsWith(baseNoLead)) {
    return `/${clean}`;
  }
  return `${base}${clean}`;
}

/**
 * Builds a guaranteed absolute HTTPS URL suitable for canonical, hreflang,
 * og:url, JPEG og:image, JSON-LD, robots.txt, and WhatsApp shareable links.
 */
export function absUrl(path: string, site?: URL | string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const origin = site ? String(site) : import.meta.env.SITE || DEFAULT_SITE;
  const resolved = withBase(path);
  return new URL(resolved, origin).toString();
}

/**
 * Builds a locale-prefixed internal route with trailing slash.
 * Example: localePath('ar', 'category/dessert-cups-bowls') -> "<base>ar/category/dessert-cups-bowls/"
 */
export function localePath(lang: Lang, subPath = ''): string {
  const clean = subPath.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!clean) return withBase(`${lang}/`);
  return withBase(`${lang}/${clean}/`);
}

/**
 * Swaps the active locale segment (/en/... <-> /ar/...) on the current pathname
 * while preserving the exact slug, category, or page path and BASE_PATH.
 */
export function alternateLocalePath(pathname: string, targetLang: Lang): string {
  const base = getBasePath();
  let rel = pathname.startsWith(base) ? pathname.slice(base.length) : pathname.replace(/^\/+/, '');
  rel = rel.replace(/^(en|ar)(?:\/|$)/, '');
  const clean = rel.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!clean) return withBase(`${targetLang}/`);
  return withBase(`${targetLang}/${clean}/`);
}
