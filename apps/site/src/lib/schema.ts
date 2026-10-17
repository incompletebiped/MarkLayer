import { COMPANY_NAME, COMPANY_URL, OG_IMAGE, ORIGIN, PRODUCT_NAME } from './site';

export type Crumb = { name: string; path?: string };
export type QA = { q: string; a: string };

const PUBLISHER = {
  '@type': 'Organization',
  name: COMPANY_NAME,
  url: COMPANY_URL,
  logo: { '@type': 'ImageObject', url: `${ORIGIN}/favicon.svg` },
} as const;

// Google's Rich Results Test rejects a bare day as a DateTime and asks for a zone.
const dateTime = (day: string) => (/^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T00:00:00Z` : day);

export function articleSchema(p: {
  h1: string;
  description: string;
  path: string;
  published: string;
  modified: string;
}): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: p.h1,
    description: p.description,
    datePublished: dateTime(p.published),
    dateModified: dateTime(p.modified),
    author: PUBLISHER,
    publisher: PUBLISHER,
    isPartOf: { '@type': 'WebSite', name: PRODUCT_NAME, url: ORIGIN },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${ORIGIN}${p.path}` },
    image: { '@type': 'ImageObject', url: OG_IMAGE },
  };
}

// A FAQPage with an empty mainEntity fails validation outright.
export function faqSchema(qa: QA[]): object | null {
  if (qa.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: qa.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}

export function breadcrumbSchema(items: Crumb[]): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => {
      const entry: Record<string, unknown> = { '@type': 'ListItem', position: i + 1, name: it.name };
      if (it.path) entry.item = `${ORIGIN}${it.path}`;
      return entry;
    }),
  };
}

export function howToSchema(p: {
  name: string;
  description: string;
  steps: { name: string; text: string }[];
}): object | null {
  if (p.steps.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: p.name,
    description: p.description,
    step: p.steps.map((s, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: s.name,
      text: s.text,
    })),
  };
}
