import { COMPANY_NAME, COMPANY_URL, CONTACT_EMAIL, UPSTREAM_REPO_URL } from './site';

/**
 * The site's floor, as data. Two renderers read it — SiteFooter.astro for the
 * prerendered pages and the footer in apps/worker/web/Landing.tsx for `/` — so
 * the links have one source. verify-build.mjs resolves every internal href.
 */

export interface FooterLink {
  href: string;
  label: string;
  /** Off-origin. Rendered with `target="_blank" rel="noopener noreferrer"`. */
  external?: boolean;
}

export interface FooterColumn {
  heading: string;
  links: FooterLink[];
}

export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    heading: 'Redline',
    links: [
      { href: '/', label: 'Home' },
      { href: '/support', label: 'Help' },
      { href: '/mcp', label: 'For developers' },
      { href: UPSTREAM_REPO_URL, label: 'Built on MarkLayer', external: true },
    ],
  },
  {
    heading: COMPANY_NAME,
    links: [
      { href: COMPANY_URL, label: 'simplelocalweb.com', external: true },
      { href: `mailto:${CONTACT_EMAIL}`, label: 'Email us' },
      { href: '/privacy', label: 'Privacy' },
    ],
  },
];

/** The colophon, after the year. Carries the Apache-2.0 attribution to the upstream project. */
export const COLOPHON = `Redline by ${COMPANY_NAME}. Built on the open-source MarkLayer project (Apache-2.0).`;
