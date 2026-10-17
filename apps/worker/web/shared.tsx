import { geist } from '@ext/lib/geist';
import { color, lineWidth } from '@ext/lib/state';
import type { DeviceMode } from '@ext/lib/types';
import { cn } from '@marklayer/types';
import { Check, Copy, Loader2, Monitor, Smartphone, Tablet } from 'lucide-preact';
import { useEffect, useRef } from 'preact/hooks';

/** Item of a panel's Base UI menu. */
export const menuItem = cn(
  'flex items-center gap-2 h-8 px-2 rounded-md cursor-pointer border-none bg-transparent outline-none',
  'text-ui text-(--ds-gray-1000) transition-colors duration-150',
  'data-highlighted:bg-(--ds-gray-alpha-100) data-disabled:opacity-40 data-disabled:cursor-default',
);

/** One glyph per viewport, so the switcher and the op badge can never disagree. */
export const DEVICE_ICONS = { desktop: Monitor, tablet: Tablet, mobile: Smartphone } as const;
export const DEVICE_LABELS: Record<DeviceMode, string> = { desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobile' };

/** Presence: a solid dot in a ring of its own colour, never a glow. */
export function PresenceDot({ live }: { live: boolean }) {
  return (
    <span
      class="w-1.5 h-1.5 rounded-full shrink-0"
      style={
        live
          ? {
              background: 'var(--ds-green-700)',
              boxShadow: '0 0 0 3px color-mix(in oklab, var(--ds-green-700) 20%, transparent)',
            }
          : { background: 'var(--ds-gray-700)' }
      }
    />
  );
}

export function Spinner() {
  return <Loader2 size={16} class="animate-spin" aria-hidden="true" />;
}

/**
 * Click-to-copy, confirmed in place. Both places a person meets it — a dashboard
 * row and the share card — swap the same glyph and announce through the same live
 * region, which is only visible otherwise; the caller brings the chrome that differs.
 */
export function CopyControl({
  copied,
  onClick,
  size,
  strokeWidth,
  class: className,
  disabled,
}: {
  copied: boolean;
  onClick: () => void;
  size: number;
  strokeWidth: number;
  class?: string;
  disabled?: boolean;
}) {
  // One weight across the swap: a check drawn heavier than the copy glyph it
  // replaces reads as the button changing size, not state.
  const Glyph = copied ? Check : Copy;
  return (
    <button
      type="button"
      aria-label={copied ? 'Link copied' : 'Copy link'}
      disabled={disabled}
      class={cn(
        geist.ctlIdle,
        className,
        // Holds through hover so the confirmation does not flicker back to grey
        // under a pointer that never left the button.
        copied && 'text-(--ds-green-700) hover:text-(--ds-green-700)',
      )}
      onClick={onClick}
    >
      <Glyph size={size} strokeWidth={strokeWidth} aria-hidden="true" />
      <span role="status" class="sr-only">
        {copied ? 'Link copied' : ''}
      </span>
    </button>
  );
}

/** Redline's mark: a navy rounded square with a white square-cap check. */
export function Logo({ size = 24, class: className }: { size?: number; class?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 52 52" aria-hidden="true" class={className}>
      <rect width="52" height="52" rx="8" fill="#0e3a75" />
      <path
        d="M4 12.5l5 5L20 6"
        transform="translate(11 11) scale(1.25)"
        fill="none"
        stroke="#fff"
        stroke-width="3.2"
        stroke-linecap="square"
      />
    </svg>
  );
}

/** Mark plus the "REDLINE" wordmark, with the red rule under the name. */
export function Wordmark({ size = 30, class: className }: { size?: number; class?: string }) {
  return (
    <span class={cn('inline-flex items-center gap-2.5', className)}>
      <Logo size={size} />
      <span class="border-b-[3px] border-ml-mark font-display text-wordmark font-extrabold uppercase text-ml-brand">
        Redline
      </span>
    </span>
  );
}

/* The landing page embeds a room in an iframe, so a bare `href="/"` loads the
   landing page inside its own screenshot. Every way out of the viewer spreads this. */
export const HOME_LINK_PROPS = { href: '/', target: '_top' } as const;

export function TextInputOverlay({
  x,
  y,
  scale: s,
  scrollY,
  onCommit,
}: {
  x: number;
  y: number;
  scale: number;
  scrollY: number;
  onCommit: (text: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fontSize = Math.max(14, lineWidth.value * 6);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const vx = x * s;
  const vy = y * s - scrollY;

  return (
    <textarea
      name="textAnnotation"
      ref={ref}
      class="absolute bg-transparent border-none outline-none resize-none p-0 m-0"
      style={{
        left: vx,
        top: vy,
        fontSize: `${fontSize * s}px`,
        lineHeight: 1.3,
        color: color.value,
        fontFamily: '"Geist", -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
        minWidth: '40px',
        minHeight: `${fontSize * s * 1.3}px`,
        caretColor: color.value,
        fieldSizing: 'content',
        zIndex: 2147483646,
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          onCommit(e.currentTarget.value.trim());
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCommit('');
        }
      }}
      onBlur={(e) => {
        onCommit(e.currentTarget.value.trim());
      }}
      placeholder="Type here…"
    />
  );
}
