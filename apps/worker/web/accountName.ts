import { isRandomUserName, localUser, setUserName } from '@ext/lib/state';
import { sessionResponseSchema } from '@marklayer/types';
import { effect } from '@preact/signals';

/** The name field applies as you type; save once the typing stops, not per keystroke. */
const SAVE_SETTLE_MS = 800;

/**
 * Keeps the display name and the signed-in account's in step, so the name you
 * chose follows you to every browser and device. The account wins on load; a
 * rename here is saved back to it. A rolled placeholder is never saved over an
 * account with no name yet — only a name somebody actually typed.
 *
 * Signed out, it does nothing: the name stays in this browser, as before.
 * Returns its disposer.
 */
export function syncAccountName(): () => void {
  let stop = () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  void (async () => {
    const res = await fetch('/auth/me').catch(() => null);
    const parsed = sessionResponseSchema.safeParse(await res?.json().catch(() => null));
    const user = parsed.success ? parsed.data.user : null;
    if (!user || disposed) return;
    let saved = user.name ?? null;
    if (saved) setUserName(saved);
    stop = effect(() => {
      const name = localUser.name;
      if (name === saved || (!saved && isRandomUserName(name))) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        saved = name;
        void fetch('/auth/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        }).catch(() => undefined);
      }, SAVE_SETTLE_MS);
    });
  })();

  return () => {
    disposed = true;
    stop();
    clearTimeout(timer);
  };
}
