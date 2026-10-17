import type { APIRoute } from 'astro';
import dates from '../data/page-dates.json';
import { ORIGIN } from '../lib/site';

type Entry = { path: string; lastmod: string; changefreq: string; priority: string };

const url = ({ path, lastmod, changefreq, priority }: Entry): string =>
  `  <url><loc>${ORIGIN}${path}</loc><lastmod>${lastmod}</lastmod><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;

/** Indexable pages only; verify-build.mjs fails the build if this and the built pages disagree. */
const ENTRIES: Entry[] = [
  { path: '/', lastmod: dates.home.modified, changefreq: 'weekly', priority: '1.0' },
  { path: '/support', lastmod: dates.support.modified, changefreq: 'monthly', priority: '0.6' },
  { path: '/mcp', lastmod: dates.mcp.modified, changefreq: 'monthly', priority: '0.5' },
  { path: '/privacy', lastmod: dates.privacy.modified, changefreq: 'yearly', priority: '0.3' },
];

export const GET: APIRoute = () => {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${ENTRIES.map(url).join('\n')}
</urlset>`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
};
