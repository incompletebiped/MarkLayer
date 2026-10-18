/**
 * Query parameters that only ever identify the click that led to a page, never
 * the page: Google's cross-domain linker, the usual campaign tags and the ad
 * click ids. Left on, every click through a site looked like a new page.
 */
const TRACKING_PARAMS = new Set([
  '_gl',
  '_ga',
  'gclid',
  'gbraid',
  'wbraid',
  'fbclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'yclid',
  'ttclid',
  'srsltid',
]);

/** A page's address without its tracking tags or fragment: the form two links to one page share. */
export function cleanPageUrl(raw: string): string {
  try {
    const url = new URL(raw);
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key) || key.startsWith('utm_')) url.searchParams.delete(key);
    }
    url.hash = '';
    // `/about` and `/about/` are one page on every site anyone reviews.
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) url.pathname = url.pathname.slice(0, -1);
    return url.toString();
  } catch {
    return raw;
  }
}
