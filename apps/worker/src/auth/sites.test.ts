import { describe, expect, test } from 'bun:test';
import type { OwnedLink } from '@marklayer/types';
import { asDb, fakeDb } from '../test-d1';
import { roomsActedOn, withSites } from './sites';

const link = (id: string): OwnedLink => ({
  id,
  url: `https://site.example/${id}`,
  createdAt: 0,
  lastAccessedAt: 0,
  expiresAt: null,
  access: 'edit',
  ownerExpiresAt: null,
  folderId: null,
  passwordProtected: false,
});
const comment = (id: string, extra: object = {}) => ({
  id,
  tool: 'comment',
  num: 1,
  text: 'fix',
  x: 0,
  y: 0,
  ts: 0,
  color: '#c8372d',
  lineWidth: 2,
  ...extra,
});
const page = (id: string, ops: unknown[]) => ({ id, ops: JSON.stringify(ops), url: null, width: null });

describe('withSites', () => {
  test('folds a site into one row on its first page, with pages and open threads counted', async () => {
    const site = { id: 'proj', page_ids: '["home","about"]' };
    const db = fakeDb({
      allQueue: [
        // containing(): one row per page found in a project.
        [
          { ...site, page: 'home' },
          { ...site, page: 'about' },
        ],
        // getMany(): the pages' ops — one open thread, one done, one reply (not a thread).
        [
          page('home', [comment('a'), comment('b', { status: 'resolved' })]),
          page('about', [comment('c'), comment('d', { parentId: 'c' })]),
        ],
      ],
    });
    const rows = await withSites({ db: asDb(db), links: [link('home'), link('about'), link('solo')] });
    expect(rows.map((r) => r.id)).toEqual(['home', 'solo']);
    expect(rows[0]?.site).toEqual({ projectId: 'proj', pageCount: 2, openCount: 2 });
    expect(rows[1]?.site).toBeUndefined();
  });

  test('keeps a later page listed when its site is someone else’s', async () => {
    const db = fakeDb({ allQueue: [[{ id: 'proj', page_ids: '["theirs","mine"]', page: 'mine' }]] });
    const rows = await withSites({ db: asDb(db), links: [link('mine')] });
    expect(rows.map((r) => r.id)).toEqual(['mine']);
    expect(rows[0]?.site).toBeUndefined();
  });
});

describe('roomsActedOn', () => {
  test('a site row reaches every page of it the owner holds', async () => {
    const db = fakeDb({
      allQueue: [
        [{ id: 'proj', page_ids: '["home","about","stray"]', page: 'home' }],
        [{ id: 'home' }, { id: 'about' }],
      ],
    });
    expect(await roomsActedOn({ db: asDb(db), id: 'home', ownerId: 'u1' })).toEqual(['home', 'about']);
  });

  test('a lone link, or a later page, is only itself', async () => {
    expect(await roomsActedOn({ db: asDb(fakeDb()), id: 'solo', ownerId: 'u1' })).toEqual(['solo']);
    const db = fakeDb({ allQueue: [[{ id: 'proj', page_ids: '["home","about"]', page: 'about' }]] });
    expect(await roomsActedOn({ db: asDb(db), id: 'about', ownerId: 'u1' })).toEqual(['about']);
  });
});
