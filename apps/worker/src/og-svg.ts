import { MARK_CHECK, MARK_CHECK_WIDTH, MARK_NAVY, MARK_RADIUS, MARK_UNITS } from './brand';

export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* Two axes, and everything on either card sits on one of them: the marks (the
   logo, the favicon) hang at the outer edge, the words start at the inner one. */
export const MARK_AXIS = 72;
export const TEXT_AXIS = 132;
export const RIGHT_EDGE = 1128;

export const CARD = { width: 1200, height: 630 };

/** Display tracking, as a fraction of the size. Both cards set their large type with it. */
export const TRACKING = -0.035;

/**
 * The cards' five tones. Both are drawn on black so the only colour on them can
 * belong to the annotation — the person's own ink on the share card, the drawn
 * stroke on the page card.
 */
export const TONE = {
  ground: '#000000',
  ink: '#ffffff',
  muted: '#8f8f8f',
  faint: '#3d3d3d',
  /** A tone barely above the ground: the watermark, an empty panel. */
  ghost: '#141414',
};

/**
 * The tally and the colophon both read as one line in two voices, so the dot
 * between their parts is defined once.
 *
 * Non-breaking spaces: XML collapses and trims ordinary runs, so a plain ' · '
 * would render as a dot jammed between the words.
 */
export const SEPARATOR = `<tspan fill="${TONE.faint}">\u00a0\u00a0·\u00a0\u00a0</tspan>`;

/**
 * The mark: the check alone when `tile` is omitted (the watermark), otherwise the
 * check on a rounded tile. `top`/`height` are the 24-unit box's, in card pixels.
 */
export function mark({
  x,
  top,
  height,
  check,
  tile,
}: {
  x: number;
  top: number;
  height: number;
  check: string;
  tile?: string;
}): string {
  const k = height / MARK_UNITS;
  const rx = (MARK_RADIUS.rx / MARK_RADIUS.at) * MARK_UNITS;
  const back = tile ? `<rect width="${MARK_UNITS}" height="${MARK_UNITS}" rx="${rx.toFixed(3)}" fill="${tile}"/>` : '';
  return `<g transform="translate(${x.toFixed(2)} ${top.toFixed(2)}) scale(${k.toFixed(6)})">${back}<path d="${MARK_CHECK}" fill="none" stroke="${check}" stroke-width="${MARK_CHECK_WIDTH}" stroke-linecap="square"/></g>`;
}

/** Both cards sign themselves top-left: the tile at 52px, the wordmark beside it on the mark's center line. */
export const SIGNATURE_MARK = { x: MARK_AXIS, top: 54, height: 52 };

export function signature(): string {
  const { x, top, height } = SIGNATURE_MARK;
  const size = 22;
  // Geist's caps are ~0.7em tall, so this baseline centers them on the tile.
  const baseline = top + height / 2 + size * 0.35;
  return `${mark({ ...SIGNATURE_MARK, check: '#ffffff', tile: MARK_NAVY })}
  <text x="${x + height + 16}" y="${baseline.toFixed(1)}" font-family="Geist" font-size="${size}" font-weight="700" letter-spacing="2.4" fill="${TONE.ink}">REDLINE</text>`;
}
