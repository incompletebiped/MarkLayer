import { describe, expect, test } from 'bun:test';
import { api } from '../api';
import { annotationStore } from '../store';
import { asDb, fakeDb } from '../test-d1';
import { mayStartBoards, teamDomains, teamGated } from './team';

const GATED = { TEAM_EMAIL_DOMAINS: 'simplelocalweb.com' };
const ID = 'dsWPMrdw6EZ8jkkhxvFKS';
const testCtx = { waitUntil: (p: Promise<unknown>) => void p, passThroughOnException: () => {} };
const now = Math.floor(Date.now() / 1000);
const session = (email: string) => ({ id: 'u1', email, last_seen_at: now, expires_at: now + 1000 });

function post({
  path,
  body,
  db,
  cookie,
}: {
  path: string;
  body: unknown;
  db: ReturnType<typeof fakeDb>;
  cookie?: string;
}) {
  return api.request(
    path,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body),
    },
    // biome-ignore lint/suspicious/noExplicitAny: a fake of only the bindings the route touches.
    { DB: asDb(db), ...GATED } as any,
    // biome-ignore lint/suspicious/noExplicitAny: ditto for the execution context.
    testCtx as any,
  );
}

const inserted = (db: ReturnType<typeof fakeDb>) => db.calls.some((call) => call.sql.includes('INSERT'));

describe('team domains', () => {
  test('parse loosely: spaces, case and a leading @ are all tolerated', () => {
    expect(teamDomains({ TEAM_EMAIL_DOMAINS: ' SimpleLocalWeb.com, @other.org ,' })).toEqual([
      'simplelocalweb.com',
      'other.org',
    ]);
  });

  test('unset leaves starting boards open to anyone, as upstream', () => {
    expect(teamGated({})).toBe(false);
    expect(mayStartBoards({ env: {}, email: null })).toBe(true);
  });

  test('match the whole domain, not a suffix of it', () => {
    expect(mayStartBoards({ env: GATED, email: 'hello@simplelocalweb.com' })).toBe(true);
    expect(mayStartBoards({ env: GATED, email: 'HELLO@SimpleLocalWeb.com' })).toBe(true);
    expect(mayStartBoards({ env: GATED, email: 'x@evilsimplelocalweb.com' })).toBe(false);
    expect(mayStartBoards({ env: GATED, email: 'x@simplelocalweb.com.evil.io' })).toBe(false);
    expect(mayStartBoards({ env: GATED, email: null })).toBe(false);
  });
});

describe('POST /{id} with the team gate on', () => {
  test('refuses a stranger minting a room, and writes nothing', async () => {
    const db = fakeDb();
    const res = await post({ path: `/${ID}`, body: { ops: [], url: 'https://example.com/' }, db });
    expect(res.status).toBe(403);
    expect(inserted(db)).toBe(false);
  });

  test('lets a signed-in team member mint one', async () => {
    // Lock read, access read (no row), then the session.
    const db = fakeDb({ firstQueue: [null, null, session('hello@simplelocalweb.com')] });
    const res = await post({
      path: `/${ID}`,
      body: { ops: [], url: 'https://example.com/' },
      db,
      cookie: 'ml_session=t',
    });
    expect(res.status).toBe(200);
    expect(inserted(db)).toBe(true);
    // Theirs from the first write, so it lands on their dashboard.
    const claim = db.calls.find((call) => call.sql.includes('SET owner_id'));
    expect(claim?.bindings).toEqual(['u1', ID]);
  });

  test('refuses someone signed in from outside the team', async () => {
    const db = fakeDb({ firstQueue: [null, null, session('client@gmail.com')] });
    const res = await post({
      path: `/${ID}`,
      body: { ops: [], url: 'https://example.com/' },
      db,
      cookie: 'ml_session=t',
    });
    expect(res.status).toBe(403);
    expect(inserted(db)).toBe(false);
  });

  test('lets a client add a page on the same site as the room they are in', async () => {
    // Lock, access (no row), the source room's url, the source room's lock.
    const db = fakeDb({ firstQueue: [null, null, { url: 'https://client.example/' }, null] });
    const res = await post({
      path: `/${ID}`,
      body: { ops: [], url: 'https://client.example/about', from: 'roomA' },
      db,
    });
    expect(res.status).toBe(200);
    expect(inserted(db)).toBe(true);
    // Nobody signed in, so nobody to own it.
    expect(db.calls.some((call) => call.sql.includes('SET owner_id'))).toBe(false);
  });

  test('refuses a page on another site, even from inside a room', async () => {
    const db = fakeDb({ firstQueue: [null, null, { url: 'https://client.example/' }, null] });
    const res = await post({ path: `/${ID}`, body: { ops: [], url: 'https://elsewhere.example/', from: 'roomA' }, db });
    expect(res.status).toBe(403);
    expect(inserted(db)).toBe(false);
  });

  test('still takes writes to a room that already exists, from anyone', async () => {
    const db = fakeDb({ firstQueue: [null, { access: 'edit', owner_id: null, owner_expires_at: null }] });
    const res = await post({ path: `/${ID}`, body: { ops: [] }, db });
    expect(res.status).toBe(200);
  });
});

describe('POST /p/{id} with the team gate on', () => {
  test('lets anyone bundle rooms that already exist', async () => {
    const db = fakeDb({
      all: [
        { id: 'a', ops: '[]', url: null, width: null },
        { id: 'b', ops: '[]', url: null, width: null },
      ],
    });
    const res = await post({ path: `/p/${ID}`, body: { pageIds: ['a', 'b'] }, db });
    expect(res.status).toBe(200);
  });

  test('refuses a stranger bundling a page that does not exist', async () => {
    const db = fakeDb({ all: [{ id: 'a', ops: '[]', url: null, width: null }] });
    const res = await post({ path: `/p/${ID}`, body: { pageIds: ['a', 'missing'] }, db });
    expect(res.status).toBe(403);
    expect(inserted(db)).toBe(false);
  });
});

describe('the realtime flush', () => {
  test('never mints a room when told it may not', async () => {
    // changes: 0 — no row to update, which is exactly the case the gate exists for.
    const db = fakeDb({ changes: 0 });
    const wrote = await annotationStore(asDb(db)).putOps({ id: ID, ops: [], mayCreate: false });
    expect(wrote).toBe(false);
    expect(inserted(db)).toBe(false);
  });
});
