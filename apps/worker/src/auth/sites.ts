import { countOpen, type DrawOp, drawOpSchema, type OwnedLink } from '@marklayer/types';
import { annotationStore, projectStore } from '../store';

/** Every op that still parses; one malformed op must not zero a whole page's count. */
function parseOps(raw: unknown[]): DrawOp[] {
  const ops: DrawOp[] = [];
  for (const op of raw) {
    const parsed = drawOpSchema.safeParse(op);
    if (parsed.success) ops.push(parsed.data);
  }
  return ops;
}

/**
 * The dashboard's rows: a site (a project) is one row, keyed by its first page,
 * carrying its page count and the open threads across every page. A later page
 * of a site the same person owns is folded into that row instead of listed on
 * its own — fifty pages of one site are one redline, not fifty.
 */
export async function withSites({ db, links }: { db: D1Database; links: OwnedLink[] }): Promise<OwnedLink[]> {
  const sites = await projectStore(db).containing(links.map((l) => l.id));
  const owned = new Set(links.map((l) => l.id));
  const firstPages = new Map<string, { projectId: string; pageIds: string[] }>();
  const rows: OwnedLink[] = [];
  for (const link of links) {
    const site = sites.get(link.id);
    const first = site?.pageIds[0];
    if (site && first === link.id) {
      firstPages.set(link.id, site);
      rows.push(link);
    } else if (!site || !first || !owned.has(first)) {
      rows.push(link);
    }
  }
  if (firstPages.size === 0) return rows;

  const pages = await annotationStore(db).getMany([...new Set([...firstPages.values()].flatMap((s) => s.pageIds))]);
  return rows.map((link) => {
    const site = firstPages.get(link.id);
    if (!site) return link;
    const openCount = site.pageIds.reduce((n, id) => n + countOpen(parseOps(pages.get(id)?.ops ?? [])), 0);
    return { ...link, site: { projectId: site.projectId, pageCount: site.pageIds.length, openCount } };
  });
}

/**
 * The rooms a dashboard action on `id` covers. On a site's first page — the row
 * the dashboard shows for the site — that is every page of the site this owner
 * holds, so a password or a removal reaches `/about` as well as the home page.
 * Anything else is just `id`.
 */
export async function roomsActedOn({
  db,
  id,
  ownerId,
}: {
  db: D1Database;
  id: string;
  ownerId: string;
}): Promise<string[]> {
  const site = (await projectStore(db).containing([id])).get(id);
  if (!site || site.pageIds[0] !== id) return [id];
  const rows = await db
    .prepare(`SELECT id FROM annotations WHERE owner_id = ? AND id IN (${site.pageIds.map(() => '?').join(',')})`)
    .bind(ownerId, ...site.pageIds)
    .all<{ id: string }>();
  const owned = new Set(rows.results.map((r) => r.id));
  // The first page leads, so a caller reading one result reads the row's own.
  return [id, ...site.pageIds.filter((p) => p !== id && owned.has(p))];
}
