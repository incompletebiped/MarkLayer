export const ORIGIN = 'https://redline.simplelocalweb.com';
/** Upstream's store listing. The site no longer links it; apps/worker still imports it. */
export const CHROME_STORE_URL = 'https://chromewebstore.google.com/detail/marklayer/fnfobegjifomgobgilaemihpcpidjamc';
/** The fallback card, for anything with no heading of its own to draw. */
export const OG_IMAGE = `${ORIGIN}/og.jpg`;

export const PRODUCT_NAME = 'Redline';
export const COMPANY_NAME = 'Simple Local Web';
export const COMPANY_URL = 'https://simplelocalweb.com';
export const CONTACT_EMAIL = 'hello@simplelocalweb.com';
/** Redline is a fork of this project; Apache-2.0 asks that the attribution stays visible. */
export const UPSTREAM_REPO_URL = 'https://github.com/thevrus/MarkLayer';

/**
 * A card drawn for one page by the Worker (`/og/page.png`), from its own heading.
 * The heading travels in the URL because these pages are static and the Worker
 * has no copy of their content.
 */
export function pageOgImage({ heading, path }: { heading: string; path: string }): string {
  const query = new URLSearchParams({ h: heading, p: path });
  return `${ORIGIN}/og/page.png?${query}`;
}

/**
 * The cross-tab channel an editor listens on for a finished payment. Read by
 * apps/worker/web/support-ui.ts; the static thank-you page that posted to it is gone.
 */
export const SUPPORT_CHANNEL = 'marklayer:support';
export const SUPPORT_PAID = 'paid';

/** apps/worker's Vite dev server, started alongside this one by `turbo run dev`. */
export const WORKER_DEV = 'http://localhost:5173';

/** The header's links, in order. */
export const SECTIONS = [
  { key: 'mcp', label: 'For developers', href: '/mcp' },
  { key: 'support', label: 'Help', href: '/support' },
  { key: 'privacy', label: 'Privacy', href: '/privacy' },
] as const;
