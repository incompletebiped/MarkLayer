import { Popover } from '@base-ui/react/popover';
import { glass } from '@ext/lib/glass';
import { portalContainer } from '@ext/lib/portal';
import { operations, toast } from '@ext/lib/state';
import { cn, countOpen } from '@marklayer/types';
import { ChevronDown, ChevronLeft, ChevronRight, Plus, Search, Trash2 } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { navigateTo, switchToPage } from './projects';
import { isClient } from './role';
import {
  currentPageIdx,
  isReadonly,
  projectId,
  projectLoading,
  projectPages,
  saveProject,
  withScheme,
} from './signals';

function hostnameOf(url: string | null): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** What a reviewer calls a page: its path, with the root as "Home". */
function pageLabel(url: string | null, i: number): string {
  if (!url) return `Page ${i + 1}`;
  try {
    const { pathname, search } = new URL(url);
    const path = decodeURIComponent(`${pathname}${search}`).replace(/\/$/, '');
    return path === '' ? 'Home' : path;
  } catch {
    return `Page ${i + 1}`;
  }
}

const ICON_BTN =
  'grid h-7 w-7 shrink-0 place-items-center rounded-lg border-none bg-transparent text-(--ds-gray-900) cursor-pointer transition-colors duration-150 hover:bg-(--ds-gray-alpha-100) hover:text-(--ds-gray-1000) disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent';

/** The open-thread count beside a page: red while there is work, absent when there is none. */
function OpenBadge({ n }: { n: number }) {
  if (n === 0) return null;
  return (
    <span class="ml-auto shrink-0 rounded-sm bg-ml-mark px-1.5 text-mini font-semibold tabular-nums text-white">
      {n}
    </span>
  );
}

/**
 * The site's pages: the current one with steps either side, and a searchable
 * list of them all with each page's open count. A tab per page stopped working
 * past a handful; a review of a 50-page site needs to find a page by name and
 * see where the open work is.
 */
export function ProjectTabs() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const pid = projectId.value;
  const pages = projectPages.value;
  const idx = currentPageIdx.value;
  // A client browses the site's pages; adding and removing them is the team's call.
  const readonly = isReadonly.value || isClient.value;
  const loading = projectLoading.value;

  if (!pid || pages.length === 0) return null;

  // Other pages count from the ops loaded with the site; the open one counts live.
  const openOn = (i: number) => countOpen(i === idx ? operations.value : (pages[i]?.ops ?? []));
  const current = pages[idx];
  const host = hostnameOf(current?.url ?? null);
  const needle = query.trim().toLowerCase();
  const listed = pages
    .map((p, i) => ({ p, i, label: pageLabel(p.url, i) }))
    .filter(({ p, label }) => !needle || label.toLowerCase().includes(needle) || p.url?.toLowerCase().includes(needle));
  const siteOpen = pages.reduce((n, _, i) => n + openOn(i), 0);

  const go = (i: number) => {
    switchToPage(i);
    setOpen(false);
    setQuery('');
  };

  const deletePage = async (i: number) => {
    if (pages.length <= 1) {
      toast('A site needs at least one page', { type: 'info' });
      return;
    }
    const page = pages[i];
    if (!page) return;
    if (!window.confirm(`Remove "${pageLabel(page.url, i)}" from this redline? Its marks and comments go with it.`))
      return;
    projectLoading.value = true;
    // Snapshot live ops back into the active page's cache before mutating the list
    const snapshot = pages.map((p, j) => (j === idx ? { ...p, ops: [...operations.value] } : p));
    const next = snapshot.filter((_, j) => j !== i);
    projectPages.value = next;
    // Stay on the same page, or step left if the active one went.
    const nextIdx = i < idx ? idx - 1 : i === idx ? Math.min(idx, next.length - 1) : idx;
    if (nextIdx !== currentPageIdx.value) {
      currentPageIdx.value = nextIdx;
      const navUrl = new URL(location.href);
      if (nextIdx === 0) navUrl.searchParams.delete('page');
      else navUrl.searchParams.set('page', String(nextIdx));
      history.replaceState(null, '', navUrl);
    }
    const ok = await saveProject(
      pid,
      next.map((p) => p.id),
    );
    projectLoading.value = false;
    toast(ok ? 'Page removed' : 'Failed to remove page', { type: ok ? 'success' : 'error' });
  };

  // The same path a link click takes, so a page the site already has is switched to rather than added twice.
  const submitAdd = async (e: Event) => {
    e.preventDefault();
    const typed = newUrl.trim();
    if (!typed) return;
    setOpen(false);
    await navigateTo({ url: withScheme(typed), source: 'add_page' });
    setNewUrl('');
  };

  return (
    <div
      class={cn(
        'z-40 flex h-9 shrink-0 items-center gap-1 border-b border-(--ds-gray-alpha-400) bg-(--ds-background-100) px-3',
        glass.font,
      )}
    >
      <button
        type="button"
        class={ICON_BTN}
        aria-label="Previous page"
        disabled={idx === 0}
        onClick={() => switchToPage(idx - 1)}
      >
        <ChevronLeft size={15} aria-hidden="true" />
      </button>

      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery('');
        }}
      >
        <Popover.Trigger className="inline-flex h-7 min-w-0 max-w-[420px] cursor-pointer items-center gap-2 rounded-lg border-none bg-transparent px-2 text-meta font-medium text-(--ds-gray-1000) transition-colors duration-150 hover:bg-(--ds-gray-alpha-100)">
          <span class="truncate">{pageLabel(current?.url ?? null, idx)}</span>
          <span class="shrink-0 tabular-nums text-(--ds-gray-900)">
            {idx + 1} of {pages.length}
          </span>
          <ChevronDown size={13} class="shrink-0 text-(--ds-gray-900)" aria-hidden="true" />
        </Popover.Trigger>
        <Popover.Portal container={portalContainer.value ?? undefined}>
          <Popover.Positioner
            positionMethod="fixed"
            side="bottom"
            align="start"
            sideOffset={6}
            collisionPadding={8}
            className="z-2147483647 outline-none"
          >
            <Popover.Popup
              className={cn(
                'flex max-h-[min(70vh,520px)] w-90 flex-col overflow-hidden rounded-xl border border-(--ds-gray-alpha-400) bg-(--ds-background-100) shadow-lg outline-none',
                glass.font,
              )}
            >
              <div class="flex items-center gap-2 border-b border-(--ds-gray-alpha-400) px-3 py-2">
                <Search size={14} class="shrink-0 text-(--ds-gray-900)" aria-hidden="true" />
                <input
                  type="text"
                  value={query}
                  ref={(el) => el?.focus()}
                  onInput={(e) => setQuery(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    const first = listed[0];
                    if (e.key === 'Enter' && first) go(first.i);
                  }}
                  placeholder={`Find a page on ${host || 'this site'}`}
                  aria-label="Find a page"
                  class="h-7 flex-1 border-none bg-transparent text-ui text-(--ds-gray-1000) outline-none placeholder:text-(--ds-gray-900)"
                />
              </div>
              <ul class="m-0 flex-1 list-none overflow-y-auto p-1">
                {listed.length === 0 && <li class="px-3 py-4 text-meta text-(--ds-gray-900)">No page matches.</li>}
                {listed.map(({ p, i, label }) => (
                  <li key={p.id} class="group m-0 flex items-center rounded-lg hover:bg-(--ds-gray-alpha-100)">
                    <button
                      type="button"
                      onClick={() => go(i)}
                      title={p.url ?? undefined}
                      aria-current={i === idx ? 'page' : undefined}
                      class={cn(
                        'flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg border-none bg-transparent px-2.5 py-2 text-left text-ui text-(--ds-gray-1000)',
                        i === idx && 'font-semibold',
                      )}
                    >
                      <span class="w-6 shrink-0 tabular-nums text-meta text-(--ds-gray-900)">{i + 1}</span>
                      <span class="truncate">{label}</span>
                      <OpenBadge n={openOn(i)} />
                    </button>
                    {!readonly && pages.length > 1 && (
                      <button
                        type="button"
                        onClick={() => void deletePage(i)}
                        disabled={loading}
                        aria-label={`Remove ${label}`}
                        class={cn(ICON_BTN, 'mr-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100')}
                      >
                        <Trash2 size={12} aria-hidden="true" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {!readonly && (
                <form
                  onSubmit={submitAdd}
                  class="flex items-center gap-2 border-t border-(--ds-gray-alpha-400) px-3 py-2"
                >
                  <Plus size={14} class="shrink-0 text-(--ds-gray-900)" aria-hidden="true" />
                  <input
                    type="text"
                    value={newUrl}
                    disabled={loading}
                    onInput={(e) => setNewUrl(e.currentTarget.value)}
                    placeholder="Add a page by its address"
                    aria-label="Add a page by its address"
                    class="h-7 flex-1 border-none bg-transparent text-ui text-(--ds-gray-1000) outline-none placeholder:text-(--ds-gray-900)"
                  />
                  <button
                    type="submit"
                    disabled={loading || !newUrl.trim()}
                    class="h-7 cursor-pointer rounded-lg border-none bg-(--ds-gray-alpha-100) px-2.5 text-meta font-semibold text-(--ds-gray-1000) disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {loading ? 'Adding…' : 'Add'}
                  </button>
                </form>
              )}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>

      <button
        type="button"
        class={ICON_BTN}
        aria-label="Next page"
        disabled={idx >= pages.length - 1}
        onClick={() => switchToPage(idx + 1)}
      >
        <ChevronRight size={15} aria-hidden="true" />
      </button>

      <span class="ml-auto shrink-0 text-meta text-(--ds-gray-900)">
        {host}
        {siteOpen > 0 && (
          <>
            {' · '}
            <span class="font-semibold tabular-nums text-ml-mark">{siteOpen} open</span>
          </>
        )}
      </span>
    </div>
  );
}
