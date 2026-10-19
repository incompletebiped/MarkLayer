import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { nowInSeconds } from '../store';
import { auth } from './routes';
import { hashToken } from './tokens';
import { SESSION_COOKIE } from './types';

type Binding = string | number | null;

/** Real SQLite behind the slice of D1 the route calls, `batch` included. */
function sqliteD1(sqlite: Database): D1Database {
  const prepare = (sql: string) => {
    let args: Binding[] = [];
    const stmt = {
      bind(...bindings: Binding[]) {
        args = bindings;
        return stmt;
      },
      first: async () => sqlite.query(sql).get(...args),
      all: async () => ({ results: sqlite.query(sql).all(...args) }),
      run: async () => ({ success: true, meta: { changes: sqlite.query(sql).run(...args).changes } }),
    };
    return stmt;
  };
  const batch = async (stmts: { run(): Promise<unknown> }[]) => {
    for (const s of stmts) await s.run();
    return [];
  };
  // biome-ignore lint/suspicious/noExplicitAny: a fake of only the methods the route calls.
  return { prepare, batch } as any;
}

const migrationsDir = new URL('../../migrations/', import.meta.url);
const schema = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(new URL(f, migrationsDir), 'utf8'));

function fakeRoom() {
  const pings: string[] = [];
  return {
    pings,
    idFromName: (name: string) => name,
    get: () => ({
      fetch: async (req: Request) => {
        pings.push(`${new URL(req.url).pathname} ${new URL(req.url).searchParams.get('id')}`);
        return new Response(null, { status: 204 });
      },
    }),
  };
}

// biome-ignore lint/suspicious/noExplicitAny: an execution context the route only calls waitUntil on.
const ctx = { waitUntil: (p: Promise<unknown>) => void p, passThroughOnException: () => {} } as any;
const GATED = 'simplelocalweb.com';

describe('DELETE /links/:id on a team deployment', () => {
  let sqlite: Database;
  let room: ReturnType<typeof fakeRoom>;
  beforeEach(async () => {
    sqlite = new Database(':memory:');
    for (const sql of schema) sqlite.exec(sql);
    sqlite.exec(`INSERT INTO users (id, email) VALUES ('me', 'me@${GATED}'), ('them', 'them@${GATED}')`);
    sqlite
      .query('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
      .run(await hashToken('tok'), 'me', nowInSeconds() + 1000);
    sqlite.exec(
      `INSERT INTO annotations (id, ops, url, owner_id) VALUES
         ('home', '[]', 'https://site.com/', 'me'),
         ('about', '[]', 'https://site.com/about', 'me'),
         ('other', '[]', 'https://else.com/', 'them')`,
    );
    sqlite.exec(`INSERT INTO projects (id, page_ids) VALUES ('site', '["home","about"]')`);
    room = fakeRoom();
  });

  const del = (id: string) =>
    auth.request(
      `/links/${id}`,
      { method: 'DELETE', headers: { Cookie: `${SESSION_COOKIE}=tok` } },
      // biome-ignore lint/suspicious/noExplicitAny: a fake room namespace.
      { DB: sqliteD1(sqlite), ANNOTATION_ROOM: room as any, TEAM_EMAIL_DOMAINS: GATED },
      ctx,
    );
  const ids = (table: string) => sqlite.query(`SELECT id FROM ${table} ORDER BY id`).all();

  test('takes every page of the site and the site itself, and empties the warm rooms', async () => {
    const res = await del('home');
    expect(await res.json<{ released: boolean }>()).toEqual({ released: true });
    expect(ids('annotations')).toEqual([{ id: 'other' }]);
    expect(ids('projects')).toEqual([]);
    expect(room.pings.sort()).toEqual(['/delete about', '/delete home']);
  });

  test("leaves someone else's board alone", async () => {
    const res = await del('other');
    expect(await res.json<{ released: boolean }>()).toEqual({ released: false });
    expect(ids('annotations')).toHaveLength(3);
    expect(room.pings).toEqual([]);
  });
});
