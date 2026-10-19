import { operations, toast as showToast } from '@ext/lib/state';
import type { DrawOp } from '@ext/lib/types';
import {
  postBody,
  postJson,
  transcribeResponseSchema,
  unwrapSafeLink,
  uploadPath,
  uploadResponseSchema,
} from '@marklayer/types';
import { signal } from '@preact/signals';
import { nanoid } from 'nanoid';
import { capture } from './analytics';
import { cleanPageUrl } from './pageUrl';

export interface ProjectPage {
  id: string;
  url: string | null;
  width: number | null;
  /** Cached ops fetched on initial project load — used for combined export. Stale once user switches pages. */
  ops: DrawOp[];
}

export const API_BASE = '/api/';

/** Project (multi-page) state. `projectId` is null when viewing a single-page share. */
export const projectId = signal<string | null>(null);
export const projectPages = signal<ProjectPage[]>([]);
export const currentPageIdx = signal(0);
/** True while the project is loading or a page is being added. */
export const projectLoading = signal(false);

/** Single-page share state — set when on `/s/:id`. */
export const annotationId = signal('');
export const pageUrl = signal('');
export const originalWidth = signal(0);

/** Fetch a project's page list + ops. Returns null on failure. */
export async function loadProject(
  id: string,
): Promise<{ pages: ProjectPage[]; createdAt: number | null; expiresAt: number | null } | null> {
  try {
    const res = await fetch(`${API_BASE}p/${id}`);
    if (!res.ok) return null;
    const json = await res.json<{
      pages: { id: string; ops: DrawOp[]; url: string | null; width: number | null }[];
      createdAt: number | null;
      expiresAt: number | null;
    }>();
    return {
      pages: json.pages.map((p) => ({ id: p.id, url: p.url, width: p.width, ops: p.ops })),
      createdAt: json.createdAt,
      expiresAt: json.expiresAt,
    };
  } catch {
    return null;
  }
}

/**
 * Re-read every page's ops, keeping the open page's live ones. Other pages were
 * loaded once with the site, and another reviewer may have marked them since;
 * the all-pages list is only worth reading if it is current.
 */
export async function refreshSitePages(): Promise<void> {
  const pid = projectId.value;
  if (!pid) return;
  const data = await loadProject(pid);
  if (!data || projectId.value !== pid) return;
  const fresh = new Map(data.pages.map((p) => [p.id, p.ops]));
  const idx = currentPageIdx.value;
  projectPages.value = projectPages.value.map((p, i) => (i === idx ? p : { ...p, ops: fresh.get(p.id) ?? p.ops }));
}

/** Persist a project's page-id list. */
export async function saveProject(id: string, pageIds: string[]): Promise<boolean> {
  const res = await postJson(`${API_BASE}p/${id}`, { pageIds });
  return res?.ok ?? false;
}

/** Uploads a screenshot (or other supported file) for a comment attachment. Returns its upload id, or null on failure. */
export function uploadFile(file: File | Blob): Promise<string | null> {
  return uploadTo({ path: '/f', file });
}

/** Uploads a recorded camera or screen clip; `kind=video` keeps the server from storing it as audio. */
export function uploadVideo(file: File | Blob): Promise<string | null> {
  return uploadTo({ path: '/f?kind=video', file });
}

async function uploadTo({ path, file }: { path: string; file: File | Blob }): Promise<string | null> {
  const res = await postBody(path, file, file.type || 'application/octet-stream');
  if (!res?.ok) {
    capture('attachment_upload_failed', { reason: res ? `http_${res.status}` : 'network' });
    return null;
  }
  const parsed = uploadResponseSchema.safeParse(await res.json());
  if (!parsed.success) {
    capture('attachment_upload_failed', { reason: 'malformed_response' });
    return null;
  }
  return parsed.data.id;
}

/** The transcript of a stored voice note, or null when it could not be had (the note still posts). */
export async function transcribeFile(id: string): Promise<string | null> {
  const res = await postJson(`${uploadPath(id)}/transcribe`, {});
  if (!res?.ok) return null;
  const parsed = transcribeResponseSchema.safeParse(await res.json());
  return parsed.success ? parsed.data.text : null;
}

/** A video note's transcript, cut from the audio track recorded beside it, which goes up in the call itself. */
export async function transcribeVideo({ id, audio }: { id: string; audio: Blob }): Promise<string | null> {
  const res = await postBody(`${uploadPath(id)}/transcribe`, audio, audio.type || 'application/octet-stream');
  if (!res?.ok) return null;
  const parsed = transcribeResponseSchema.safeParse(await res.json());
  return parsed.success ? parsed.data.text : null;
}

/** Where `uploadFile`'s id serves back from — relative, since the web app already runs on that origin. */
export function fileUrl(id: string): string {
  return uploadPath(id);
}

/** Show page `i` of the open project, keeping the ops of the one being left. */
export function switchToPage(i: number) {
  const idx = currentPageIdx.value;
  if (i === idx) return;
  projectPages.value = projectPages.value.map((p, j) => (j === idx ? { ...p, ops: [...operations.value] } : p));
  currentPageIdx.value = i;
  const url = new URL(location.href);
  if (i === 0) url.searchParams.delete('page');
  else url.searchParams.set('page', String(i));
  history.replaceState(null, '', url);
}

/** What the server says when starting a board is the team's alone; shown as is. */
export const TEAM_ONLY_TOAST = 'That page is on another site. Only the team can start a board there.';

/**
 * The width every new page is laid out at in desktop view. It used to be the
 * creator's window, so a page first opened in a narrow window kept the site's
 * mobile layout for everyone; a fixed desktop size gives every reviewer the same
 * layout, Auto zoom fits it to their screen, and marks line up between them.
 */
export const DESKTOP_REFERENCE_WIDTH = 1440;

/** The room the viewer is on now, which a new page is opened from. */
function currentRoomId(): string | undefined {
  if (projectId.value) return projectPages.value[currentPageIdx.value]?.id;
  return annotationId.value || undefined;
}

/**
 * Create an empty annotation row for a URL. `from` lets someone outside the team
 * add a page on the same site as the room they are in; a 403 means it was not.
 */
export async function createAnnotationFor(url: string): Promise<{ id: string } | { error: string }> {
  const id = nanoid();
  const res = await postJson(`${API_BASE}${id}`, {
    ops: [],
    url,
    width: DESKTOP_REFERENCE_WIDTH,
    from: currentRoomId(),
  });
  if (res?.ok) return { id };
  return { error: res?.status === 403 ? TEAM_ONLY_TOAST : 'Failed to add page' };
}

/** A typed address as a fetchable URL: `example.com` means https, and an Outlook Safe Link means its target. */
export const withScheme = (url: string): string => unwrapSafeLink(/^https?:\/\//i.test(url) ? url : `https://${url}`);

/**
 * Navigate to a new URL.
 * - In project mode (`/p/:id`): append a new page to the project and switch to it (no full reload).
 * - In single-share mode (`/s/:id`): convert to a project bundling the current + new page, redirect to `/p/:projectId`.
 * - On landing (no context): create a fresh `/s/:id` share for the new URL.
 */
export async function navigateTo({ url: raw, source = 'viewer' }: { url: string; source?: string }) {
  // One page per click: a link can report twice, and a second create while the
  // first is in flight left an orphaned copy of the page behind.
  if (projectLoading.value) return;
  const url = cleanPageUrl(raw);
  const pid = projectId.value;
  // A page the board already has is switched to, not opened again.
  if (pid) {
    const existing = projectPages.value.findIndex((p) => p.url !== null && cleanPageUrl(p.url) === url);
    if (existing !== -1) {
      switchToPage(existing);
      return;
    }
  }
  // Which of the three shapes a session takes — a first page, a second page that
  // promotes a share into a project, another page on an existing project — and
  // what asked for it. Counted here because this is where every entry point lands.
  capture('page_opened', { mode: pid ? 'project_page' : annotationId.value ? 'promoted' : 'new', source });
  if (pid) {
    projectLoading.value = true;
    const created = await createAnnotationFor(url);
    if ('error' in created) {
      projectLoading.value = false;
      capture('page_open_failed', { mode: 'project_page', step: 'create_page' });
      showToast(created.error, { type: 'error' });
      return;
    }
    const newPageId = created.id;
    const pages = projectPages.value;
    const idx = currentPageIdx.value;
    // Snapshot current page's live ops back into the cached list before switching
    const snapshot = pages.map((p, j) => (j === idx ? { ...p, ops: [...operations.value] } : p));
    const next: ProjectPage[] = [...snapshot, { id: newPageId, url, width: DESKTOP_REFERENCE_WIDTH, ops: [] }];
    projectPages.value = next;
    const ok = await saveProject(
      pid,
      next.map((p) => p.id),
    );
    if (!ok) {
      projectLoading.value = false;
      capture('page_open_failed', { mode: 'project_page', step: 'save_project' });
      showToast('Failed to save project', { type: 'error' });
      return;
    }
    currentPageIdx.value = next.length - 1;
    const navUrl = new URL(location.href);
    navUrl.searchParams.set('page', String(next.length - 1));
    history.replaceState(null, '', navUrl);
    projectLoading.value = false;
    return;
  }

  // Single-share mode: promote into a project bundling current + new
  const currentId = annotationId.value;
  const currentUrl = pageUrl.value;
  // A link back to the page already open (a logo, a "home" link) is no new page.
  if (currentId && currentUrl && cleanPageUrl(currentUrl) === url) return;
  if (currentId && currentUrl) {
    projectLoading.value = true;
    // Best-effort flush of current ops so the project's first page has them on first read
    await postJson(`${API_BASE}${currentId}`, {
      ops: operations.value,
      url: currentUrl,
      width: originalWidth.value || DESKTOP_REFERENCE_WIDTH,
    });
    const created = await createAnnotationFor(url);
    if ('error' in created) {
      projectLoading.value = false;
      capture('page_open_failed', { mode: 'promoted', step: 'create_page' });
      showToast(created.error, { type: 'error' });
      return;
    }
    const newPageId = created.id;
    const newProjectId = nanoid();
    const ok = await saveProject(newProjectId, [currentId, newPageId]);
    if (!ok) {
      projectLoading.value = false;
      capture('page_open_failed', { mode: 'promoted', step: 'save_project' });
      showToast('Failed to create project', { type: 'error' });
      return;
    }
    location.href = `/p/${newProjectId}?page=1`;
    return;
  }

  // Landing: a new redline is a site from its first page, so the link it opens on
  // is the one link it keeps — every page added later lands inside it.
  const id = nanoid();
  const res = await postJson(`${API_BASE}${id}`, { ops: [], url, width: DESKTOP_REFERENCE_WIDTH });
  // Refused outright: there is no board to land on, so stay and say why.
  if (res?.status === 403) {
    showToast('Only the team can start a new board. Sign in with your team email first.', { type: 'error' });
    return;
  }
  if (!res?.ok) {
    // Instrumented like the other two modes, so a drop at the top of the funnel
    // is a number rather than a mystery. The redirect still runs: the viewer
    // re-creates the row on save, and stranding someone on the landing page is worse.
    capture('page_open_failed', { mode: 'new', step: 'create_page' });
  }
  const siteId = nanoid();
  if (!(await saveProject(siteId, [id]))) {
    capture('page_open_failed', { mode: 'new', step: 'save_project' });
    location.href = `/s/${id}`;
    return;
  }
  location.href = `/p/${siteId}`;
}
