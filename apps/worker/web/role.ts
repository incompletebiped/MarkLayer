import { allowedTools } from '@ext/lib/state';
import { sessionResponseSchema } from '@marklayer/types';
import { computed } from '@preact/signals';
import { PHONE_TOOLS } from './signals';

/** A client moves around and comments — the same two tools a phone gets. */
const CLIENT_TOOLS = PHONE_TOOLS.map((t) => t.tool);

/** True for anyone outside the team: the viewer shows them the page, their name and the comments, and little else. */
export const isClient = computed(() => allowedTools.value !== null);

/**
 * Start everyone as a client and lift it once the session says they may start
 * boards, so a client never sees the full toolbar flash past while it loads; a
 * team member sees the short one for the length of one request instead. Where
 * nobody is limited (no team gate), the answer lifts it for everyone.
 */
export function startViewerRole(): void {
  allowedTools.value = CLIENT_TOOLS;
  void fetch('/auth/me')
    .then((res) => res.json())
    .then((json) => {
      const parsed = sessionResponseSchema.safeParse(json);
      if (parsed.success && (parsed.data.canStartBoards ?? true)) allowedTools.value = null;
    })
    .catch(() => undefined);
}
