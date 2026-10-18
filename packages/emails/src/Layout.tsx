import { Body, Container, Head, Hr, Html, Img, Preview, Section, Text } from '@react-email/components';
import type { ReactNode } from 'react';

/** Where Redline lives: the footer link, and the host the header logo loads from. */
const SITE = 'https://redline.simplelocalweb.com';

/**
 * The shell every Redline email shares. Templates supply a body and a preview
 * line; framing, width and footer live here so a new template cannot drift.
 *
 * Everything is authored in px and hex on purpose — the build rejects `rem`
 * (Outlook ignores it) and the theme only carries the `#`-valued tokens, since
 * `oklch()` renders as black in half the inboxes that exist.
 */
export function Layout({ preview, children }: { preview: string; children: ReactNode }) {
  return (
    <Html lang="en">
      <Head>
        {/* Without this, Gmail/Apple Mail auto-dark-mode inverts every color:
            the near-black button and white label flip to a washed-out light
            button with black text, and the white page turns charcoal. This
            template has no dark palette to offer instead, so it opts out and
            renders identically everywhere. */}
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      {/* The line a client shows next to the subject. Left out, it fills with whatever text comes first. */}
      <Preview>{preview}</Preview>
      <Body className="bg-white font-sans text-ml-fg m-0 p-0">
        <Container className="mx-auto max-w-[480px] px-6 py-10">
          {/* The lockup as an image: no mail client renders Barlow Condensed, so
              type alone can't carry the wordmark. Where images are blocked
              (Outlook by default), the alt text is styled to read as the
              wordmark instead of a broken-image icon. The file is 3x, for sharp
              screens, and lives in apps/worker/static. */}
          <Img
            src={`${SITE}/email-logo.png`}
            width="120"
            height="32"
            alt="REDLINE"
            className="text-ml-brand m-0 mb-8 text-[15px] font-bold tracking-[0.12em]"
          />
          {children}
          <Hr className="my-8 border-0 border-t border-solid border-[#eaeaea]" />
          <Section>
            <Text className="m-0 text-[12px] leading-[18px] text-[#8f8f8f]">
              Redline by Simple Local Web ·{' '}
              <a href={SITE} className="text-ml-brand">
                {new URL(SITE).host}
              </a>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
