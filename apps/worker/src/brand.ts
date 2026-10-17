/**
 * Redline's mark: a navy tile with a white square-capped check, on a 24-unit box.
 * The OG cards draw it from these; apps/site keeps its own copy (separate build).
 */
export const MARK_UNITS = 24;
export const MARK_CHECK = 'M4 12.5l5 5L20 6';
export const MARK_CHECK_WIDTH = 3.2;
/** Corner radius as drawn at the 52px reference size; scales with the tile. */
export const MARK_RADIUS = { rx: 8, at: 52 };
export const MARK_NAVY = '#0E3A75';

/** The red accent: the pen stroke and the pin on the page card, and nowhere else. */
export const MARK_ACCENT = '#C8372D';
