import { Toasts } from '@ext/components/Toasts';
import { cn, sessionResponseSchema, UPLOAD_ACCEPT } from '@marklayer/types';
import { useSignal } from '@preact/signals';
import { COLOPHON, FOOTER_COLUMNS } from '@site/lib/footer';
import { Check } from 'lucide-preact';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { useLandingUpload } from './landing/useLandingUpload';
import { Wordmark } from './shared';
import { navigateTo, withScheme } from './signals';

const NAV_LINKS = [
  { label: 'How it works', href: '#how' },
  { label: 'For clients', href: '#clients' },
  { label: 'Simple Local Web', href: 'https://simplelocalweb.com' },
];

const STEPS = [
  { title: 'We send you a link', body: 'It opens your website, as it is right now. No account, nothing to install.' },
  {
    title: 'You mark it up',
    body: 'Circle things, draw arrows, pin a note, or flag a line of text. Right on the page.',
  },
  {
    title: 'We check it off',
    body: 'Every mark lands on our list. You watch each one turn from red to done.',
  },
];

const MARKS = [
  { title: 'Circle and point', body: 'Draw around a photo or an arrow at a button. Pen, shapes and arrows.' },
  { title: 'Pin a note', body: 'Click anywhere to leave a numbered note. Reply back and forth on it.' },
  { title: 'Flag the words', body: 'Highlight a sentence and say what it should say instead.' },
  { title: 'Show us', body: 'Attach a screenshot or a photo, or record a quick voice note.' },
];

/** The demo board's list, in the design's own words. The last one is already done. */
const DEMO_ITEMS = [
  { n: 1, text: 'Logo looks fuzzy on my phone' },
  { n: 2, text: 'Use the truck photo here instead' },
  { n: 3, text: 'Make this button bigger, say “Book now”' },
  { n: 4, text: 'Footer hours say Sunday', done: true },
];

const SECTION_LABEL_CLS = 'm-0 font-display text-sub font-bold uppercase tracking-eyebrow text-ml-brand';
const CARD_CLS = 'rounded-xl border border-ml-rule bg-white p-6';

function Section({
  id,
  label,
  title,
  children,
}: {
  id: string;
  label: string;
  title: string;
  children: ComponentChildren;
}) {
  return (
    <section id={id} class="scroll-mt-24 py-16 sm:py-24">
      <p class={SECTION_LABEL_CLS}>{label}</p>
      <h2 class="mt-3 max-w-[18em] font-display text-section font-extrabold uppercase text-ml-brand">{title}</h2>
      <div class="mt-10">{children}</div>
    </section>
  );
}

function Pin({ n, done, class: className }: { n: number; done?: boolean; class?: string }) {
  return (
    <span
      class={cn(
        'absolute grid size-7 place-items-center rounded-sm text-ui-lg font-bold text-white shadow-[0_2px_6px_rgb(0_0_0/0.2)]',
        done ? 'bg-ml-brand' : 'bg-ml-mark',
        className,
      )}
    >
      {n}
    </span>
  );
}

/**
 * A client's site with four marks on it and the list they became: the product, drawn flat.
 * The greens and greys are the pretend client's own site, not Redline's palette.
 */
function DemoBoard() {
  return (
    <div class="flex flex-col gap-3.5 sm:flex-row" aria-hidden="true">
      <div class="relative flex min-h-[360px] flex-1 flex-col overflow-hidden rounded-[10px] border border-ml-rule bg-[#fafbfc]">
        <div class="flex h-[30px] items-center gap-1.5 bg-[#eef1f5] px-3">
          <span class="size-[9px] rounded-full bg-ml-border" />
          <span class="size-[9px] rounded-full bg-ml-border" />
          <span class="size-[9px] rounded-full bg-ml-border" />
          <span class="ml-2.5 text-mini text-ml-muted">staging.clientsite.com</span>
        </div>
        <div class="relative flex flex-1 flex-col gap-3 p-[22px]">
          <div class="h-3.5 w-2/5 rounded-[3px] bg-[#2f5d50]" />
          <div class="h-[110px] rounded-md bg-[#d7e3da]" />
          <div class="h-2.5 w-4/5 rounded-[3px] bg-ml-rule" />
          <div class="h-2.5 w-[65%] rounded-[3px] bg-ml-rule" />
          <div class="flex gap-2">
            <div class="h-[30px] w-[110px] rounded bg-[#2f5d50]" />
            <div class="h-[30px] w-[90px] rounded border border-[#2f5d50]" />
          </div>
          <div class="grid grid-cols-3 gap-2">
            <div class="h-[60px] rounded bg-[#eef1f5]" />
            <div class="h-[60px] rounded bg-[#eef1f5]" />
            <div class="h-[60px] rounded bg-[#eef1f5]" />
          </div>

          <div class="absolute top-[50px] right-3 left-3 h-[130px] -rotate-2 rounded-[50%] border-[3px] border-ml-mark" />
          <svg
            class="absolute top-[196px] left-[150px] text-ml-mark"
            aria-hidden="true"
            width="90"
            height="56"
            viewBox="0 0 90 56"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M86 50C60 46 30 34 8 12" />
            <path d="M8 26L8 12L22 12" />
          </svg>
          <Pin n={1} class="top-3.5 left-[150px]" />
          <Pin n={2} class="top-11 right-4" />
          <Pin n={3} class="top-[236px] left-[236px]" />
          <Pin n={4} done class="bottom-7 left-6" />
        </div>
      </div>

      <div class="flex flex-col gap-2 sm:w-[210px]">
        <p class="m-0 px-0.5 pt-0.5 pb-1 font-display text-sub font-bold uppercase text-ml-fg">
          Redlines · {DEMO_ITEMS.length}
        </p>
        {DEMO_ITEMS.map(({ n, text, done }) => (
          <div
            key={n}
            class={cn(
              'flex gap-2 rounded-lg border border-ml-rule p-2.5 text-ui leading-[1.4]',
              done ? 'bg-ml-bg text-ml-muted' : 'bg-white',
            )}
          >
            {done ? (
              <span class="grid size-4 shrink-0 place-items-center rounded-[3px] bg-ml-brand text-white">
                <Check size={11} strokeWidth={4} />
              </span>
            ) : (
              <span class="size-4 shrink-0 rounded-[3px] border-2 border-ml-border" />
            )}
            <span class={cn(done && 'line-through')}>
              {done ? (
                `${n} ${text}`
              ) : (
                <>
                  <strong class="text-ml-mark">{n}</strong> {text}
                </>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Paste an address to start a board on that page, or hand over a PDF or photo instead. */
function StartForm() {
  const { fileInputRef, uploading, dragging, uploadFile } = useLandingUpload();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div id="start" class="scroll-mt-24">
      <form
        class="flex max-w-[480px] flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          const input = inputRef.current?.value.trim();
          if (input) navigateTo({ url: withScheme(input), source: 'hero_form' });
        }}
      >
        <label for="rl-url" class="sr-only">
          Website address
        </label>
        {/* text-base: iOS Safari zooms the page when a focused field's text is under 16px. */}
        <input
          id="rl-url"
          ref={inputRef}
          name="url"
          type="text"
          inputMode="url"
          autocomplete="url"
          placeholder={dragging.value ? 'Let go to open it…' : 'Paste your site’s address'}
          class="h-13 w-full min-w-0 rounded-lg sm:flex-1 border-2 border-ml-border bg-white px-4 text-base text-ml-fg outline-none placeholder:text-ml-muted focus:border-ml-brand"
        />
        <button
          type="submit"
          class="h-13 cursor-pointer rounded-lg border-none bg-ml-btn px-[22px] text-base font-bold text-ml-btn-fg transition-colors hover:bg-ml-btn-hover"
        >
          Start a redline
        </button>
      </form>
      <p class="mt-3 mb-0 text-ui-lg text-ml-muted">
        Got a PDF or a photo instead?{' '}
        <button
          type="button"
          disabled={uploading.value !== null}
          onClick={() => fileInputRef.current?.click()}
          class="cursor-pointer border-none bg-transparent p-0 text-ui-lg font-semibold text-ml-brand underline underline-offset-2 hover:text-ml-btn-hover disabled:cursor-progress disabled:opacity-60"
        >
          {uploading.value ? 'Uploading…' : 'Upload it'}
        </button>
      </p>
      <input
        ref={fileInputRef}
        type="file"
        accept={UPLOAD_ACCEPT}
        hidden
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          // Cleared so picking the same file twice still fires.
          e.currentTarget.value = '';
          if (file) void uploadFile(file);
        }}
      />
    </div>
  );
}

const BTN_CLS =
  'rounded-lg bg-ml-btn px-[18px] py-[11px] font-semibold text-ml-btn-fg no-underline transition-colors hover:bg-ml-btn-hover';

/** In place of the form for anyone not signed in on the team: clients only ever need the link they were sent. */
function TeamOnly() {
  return (
    <div
      id="start"
      class="flex max-w-[480px] scroll-mt-24 flex-col items-start gap-4 rounded-lg border border-ml-rule bg-white p-5"
    >
      <p class="m-0 text-body leading-prose text-ml-slate">
        <strong class="text-ml-fg">Got a link from us?</strong> Just open it. There’s no account to make. Starting a new
        redline is for the Simple Local Web team.
      </p>
      <a href="/app" class={BTN_CLS}>
        Team sign in
      </a>
    </div>
  );
}

/** The landing page, from the Redline brand sheet: navy carries the name, red is only ever a mark. */
export function Landing() {
  // Null until the session answers; the form shows meanwhile, since the server refuses a create either way.
  const canStart = useSignal<boolean | null>(null);
  const signedIn = useSignal(false);
  useEffect(() => {
    fetch('/auth/me')
      .then((res) => res.json())
      .then((json) => {
        const parsed = sessionResponseSchema.safeParse(json);
        canStart.value = parsed.success ? (parsed.data.canStartBoards ?? true) : null;
        signedIn.value = parsed.success && parsed.data.user !== null;
      })
      .catch(() => undefined);
  }, []);
  const teamOnly = canStart.value === false;

  return (
    <div class="ml-force-light min-h-screen bg-ml-bg font-ui text-ml-fg">
      <header class="sticky top-0 z-10 border-b border-ml-rule bg-white/95 backdrop-blur">
        <nav class="mx-auto flex h-[72px] w-full max-w-[1280px] items-center justify-between gap-6 px-4 sm:px-10">
          <a href="/" class="no-underline">
            <Wordmark />
          </a>
          <div class="flex items-center gap-7 text-body font-medium">
            {NAV_LINKS.map(({ label, href }) => (
              <a
                key={href}
                href={href}
                class="hidden text-ml-slate no-underline transition-colors hover:text-ml-brand md:inline"
              >
                {label}
              </a>
            ))}
            {/* Signed in, the dashboard is the way back to every board you started. */}
            {signedIn.value && (
              <a href="/app" class="font-semibold text-ml-brand no-underline transition-colors hover:text-ml-btn-hover">
                Your redlines
              </a>
            )}
            <a href={teamOnly ? '/app' : '#start'} class={BTN_CLS}>
              {teamOnly ? 'Team sign in' : 'Start a redline'}
            </a>
          </div>
        </nav>
      </header>

      <main class="mx-auto w-full max-w-[1280px] px-4 sm:px-10">
        <section class="grid items-center gap-12 py-12 sm:py-16 lg:grid-cols-[1.15fr_1fr]">
          <div class="flex flex-col gap-[22px]">
            <p class="m-0 flex items-center gap-2 text-ui font-bold uppercase tracking-eyebrow text-ml-brand">
              <span class="size-2 bg-ml-mark" aria-hidden="true" />
              Website review, the easy way
            </p>
            <h1 class="m-0 font-display text-display font-extrabold uppercase text-ml-brand">
              Mark it in <span class="text-ml-mark">red.</span>
              <br />
              We’ll knock it out.
            </h1>
            <p class="m-0 max-w-[440px] text-sub text-ml-slate">
              Circle a photo, point at a button, flag a typo, or tell us something just feels off. Every mark lands on
              our list, and you watch each one get checked off.
            </p>
            {teamOnly ? <TeamOnly /> : <StartForm />}
            <p class="m-0 flex flex-wrap gap-x-5 gap-y-1 text-ui-lg text-ml-muted">
              <span>No account</span>
              <span>Nothing to install</span>
              <span>Free for every client</span>
            </p>
          </div>
          <div class="rounded-[14px] bg-white p-4 shadow-[0_2px_10px_rgb(14_58_117/0.08)] sm:p-6">
            <DemoBoard />
          </div>
        </section>

        <Section id="how" label="How it works" title="One link. Your marks. Our list.">
          <ol class="m-0 grid list-none gap-4 p-0 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} class={CARD_CLS}>
                <span class="grid size-7 place-items-center rounded-sm bg-ml-mark text-ui-lg font-bold text-white">
                  {i + 1}
                </span>
                <h3 class="mt-4 mb-0 text-lede font-bold text-ml-fg">{s.title}</h3>
                <p class="mt-2 mb-0 text-body leading-prose text-ml-slate">{s.body}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="clients" label="For clients" title="Say it however it makes sense to you.">
          <p class="m-0 mb-8 max-w-[56ch] text-sub text-ml-slate">
            I’ll send you the redline. Mark up anything you want changed. It doesn’t have to be words: if something just
            looks off, circle it and we’ll take it from there.
          </p>
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {MARKS.map((m) => (
              <div key={m.title} class={CARD_CLS}>
                <h3 class="m-0 text-lede font-bold text-ml-fg">{m.title}</h3>
                <p class="mt-2 mb-0 text-body leading-prose text-ml-slate">{m.body}</p>
              </div>
            ))}
          </div>
        </Section>
      </main>

      <footer class="border-t border-ml-rule bg-white">
        <div class="mx-auto w-full max-w-[1280px] px-4 py-12 sm:px-10">
          <div class="grid gap-10 sm:grid-cols-[1.3fr_repeat(3,1fr)]">
            <div class="flex flex-col gap-3">
              <Wordmark size={26} />
              <p class="m-0 text-ui text-ml-muted">by Simple Local Web</p>
            </div>
            {FOOTER_COLUMNS.map((col) => (
              <div key={col.heading}>
                <p class="m-0 mb-3 text-ui font-bold uppercase tracking-eyebrow text-ml-muted">{col.heading}</p>
                <ul class="m-0 list-none space-y-1 p-0">
                  {col.links.map((l) => (
                    <li key={l.href} class="m-0 p-0">
                      <a
                        href={l.href}
                        target={l.external ? '_blank' : undefined}
                        rel={l.external ? 'noopener noreferrer' : undefined}
                        class="inline-flex min-h-9 items-center text-body text-ml-slate no-underline transition-colors hover:text-ml-brand"
                      >
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p class="mt-10 mb-0 text-fine text-ml-muted">
            &copy; {new Date().getFullYear()} Simple Local Web &middot; {COLOPHON}
          </p>
        </div>
      </footer>

      <Toasts />
    </div>
  );
}
