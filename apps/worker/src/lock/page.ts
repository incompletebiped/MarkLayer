import { HTML_HEADERS, page } from '../auth/verify-page';
import { escapeXml } from '../og-svg';

/** Where a successful unlock may send the browser: a room or a project on this origin, nothing else. */
const RETURN_PATH = /^\/(s|p)\/[A-Za-z0-9_-]+$/;

export function safeReturnPath({ value, roomId }: { value: unknown; roomId: string }): string {
  return typeof value === 'string' && RETURN_PATH.test(value) ? value : `/s/${roomId}`;
}

const MESSAGES = {
  locked: null,
  wrong: 'That password is not right. Check it with whoever sent you the link.',
  throttled: 'Too many wrong passwords. Wait 15 minutes, then try again.',
} as const;

const STATUS = { locked: 401, wrong: 401, throttled: 429 } as const;

/**
 * Served in place of the viewer for a protected room. Plain HTML, no app shell:
 * the shell's OG tags name the annotated site, and a crawler must not get those.
 */
export function unlockPage({
  roomId,
  returnTo,
  reason,
}: {
  roomId: string;
  returnTo: string;
  reason: keyof typeof MESSAGES;
}): Response {
  const message = MESSAGES[reason];
  const body = `<h1>This link is password protected</h1>
<p>Enter the password the owner shared with you.</p>
${message ? `<p class="alert" role="alert">${message}</p>` : ''}
<form class="stack" method="post" action="/s/${encodeURIComponent(roomId)}/unlock">
<input type="hidden" name="return" value="${escapeXml(returnTo)}">
<input type="password" name="password" aria-label="Password" placeholder="Password" autocomplete="current-password" required autofocus>
<button type="submit">Open</button>
</form>
<small>If you own this link, sign in to open it without a password.</small>`;
  return new Response(page({ title: 'Password required · Redline', body }), {
    status: STATUS[reason],
    headers: HTML_HEADERS,
  });
}
