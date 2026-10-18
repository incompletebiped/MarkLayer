import { geist } from '@ext/lib/geist';
import { focusedAnnotationId, operations } from '@ext/lib/state';
import { timeAgo } from '@ext/lib/time';
import {
  type AnnotationOp,
  cn,
  countOpen,
  type DrawOp,
  isAnnotationOp,
  isSettled,
  opAnchor,
  resolveOpStatus,
} from '@marklayer/types';
import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { opBody, opLabel } from './annotationItems';
import { currentPageIdx, type ProjectPage, projectPages, refreshSitePages, switchToPage } from './projects';

/** What the comments panel lists: the page on screen, or every page of the site. */
export const panelScope = signal<'page' | 'site'>('page');

const STATUS_WORD = {
  open: '',
  in_progress: 'In progress',
  resolved: 'Done',
  approved: 'Approved',
  dismissed: 'Dismissed',
};

/** Same rule as the page picker: the path, with the root as "Home". */
function pageLabel(page: ProjectPage, i: number): string {
  if (!page.url) return `Page ${i + 1}`;
  try {
    const { pathname, search } = new URL(page.url);
    const path = decodeURIComponent(`${pathname}${search}`).replace(/\/$/, '');
    return path === '' ? 'Home' : path;
  } catch {
    return `Page ${i + 1}`;
  }
}

/** A page's threads, top to bottom: root annotations only, since a reply lives inside its thread. */
function threadsOf(ops: readonly DrawOp[]): AnnotationOp[] {
  return ops
    .filter((op): op is AnnotationOp => isAnnotationOp(op) && !(op.tool === 'comment' && op.parentId))
    .sort((a, b) => opAnchor(a).y - opAnchor(b).y);
}

/** The two-way switch in the panel header, shown only where there is more than one page. */
export function ScopeToggle() {
  if (projectPages.value.length < 2) return null;
  const scope = panelScope.value;
  return (
    <fieldset class="mt-3 grid grid-cols-2 rounded-lg border-none bg-(--ds-gray-alpha-100) p-0.5">
      <legend class="sr-only">Show comments for</legend>
      {(['page', 'site'] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={scope === value}
          onClick={() => {
            panelScope.value = value;
          }}
          class={cn(
            'h-7 cursor-pointer rounded-md border-none text-meta font-medium transition-colors duration-150',
            scope === value
              ? 'bg-(--ds-background-100) text-(--ds-gray-1000) [box-shadow:var(--ds-shadow-border-small)]'
              : 'bg-transparent text-(--ds-gray-900) hover:text-(--ds-gray-1000)',
          )}
        >
          {value === 'page' ? 'This page' : 'All pages'}
        </button>
      ))}
    </fieldset>
  );
}

/**
 * Every thread on the site, grouped by page — the list a team works through.
 * Choosing one goes to its page and opens it there, in the page's own list.
 */
export function SiteComments() {
  useEffect(() => {
    void refreshSitePages();
  }, []);
  const pages = projectPages.value;
  const idx = currentPageIdx.value;
  const groups = pages
    .map((page, i) => {
      const ops = i === idx ? operations.value : page.ops;
      return { page, i, threads: threadsOf(ops), open: countOpen(ops) };
    })
    .filter((g) => g.threads.length > 0);

  const go = (i: number, op: AnnotationOp) => {
    switchToPage(i);
    panelScope.value = 'page';
    focusedAnnotationId.value = op.id;
  };

  if (groups.length === 0) {
    return (
      <div class="flex h-44 flex-col items-center justify-center gap-2 px-6 text-center">
        <span class="text-ui font-medium text-(--ds-gray-1000)">No comments on any page yet</span>
      </div>
    );
  }

  return (
    <div class="flex-1 overflow-y-auto overscroll-contain">
      {groups.map(({ page, i, threads, open }) => (
        <section key={page.id}>
          <h3 class="sticky top-0 z-1 m-0 flex items-center gap-2 border-b border-(--ds-gray-alpha-400) bg-(--ds-background-100) px-4 py-2 text-meta font-semibold text-(--ds-gray-1000)">
            <span class="truncate">{pageLabel(page, i)}</span>
            {i === idx && <span class="font-normal text-(--ds-gray-900)">· on screen</span>}
            <span class="ml-auto shrink-0 tabular-nums font-normal text-(--ds-gray-900)">
              {open > 0 ? <span class="font-semibold text-ml-mark">{open} open</span> : 'All done'}
            </span>
          </h3>
          <ul class="m-0 list-none p-0">
            {threads.map((op) => {
              const status = resolveOpStatus(op);
              const settled = isSettled(status) || status === 'dismissed';
              return (
                <li key={op.id} class="m-0 border-b border-(--ds-gray-alpha-400)">
                  <button
                    type="button"
                    onClick={() => go(i, op)}
                    class={cn(geist.bareBtn, 'block w-full px-4 py-3 text-left hover:bg-(--ds-gray-alpha-100)')}
                  >
                    <span class="mb-1 flex items-center gap-2 text-meta">
                      <span
                        class={cn(
                          'grid size-5 shrink-0 place-items-center rounded-sm text-mini font-semibold text-white',
                          settled ? 'bg-ml-brand' : 'bg-ml-mark',
                        )}
                      >
                        {op.tool === 'comment' ? op.num : '•'}
                      </span>
                      <span class="flex-1 truncate font-semibold text-(--ds-gray-1000)">
                        {op.author || opLabel(op)}
                      </span>
                      {STATUS_WORD[status] && <span class="text-(--ds-gray-900)">{STATUS_WORD[status]}</span>}
                      {'ts' in op && typeof op.ts === 'number' && (
                        <span class="tabular-nums text-(--ds-gray-900)">{timeAgo(op.ts)}</span>
                      )}
                    </span>
                    <span
                      class={cn(
                        'line-clamp-2 block text-ui leading-relaxed text-(--ds-gray-1000)',
                        settled && 'line-through opacity-50',
                      )}
                    >
                      {opBody(op) || opLabel(op)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
