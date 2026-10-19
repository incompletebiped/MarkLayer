import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mayProxyHost, resetKnownHosts } from './proxy-gate';

/** Real SQLite behind `prepare().bind().first()`, so the host match runs as SQL. */
function sqliteD1(sqlite: Database): D1Database {
  const prepare = (sql: string) => {
    let args: string[] = [];
    const stmt = {
      bind(...bindings: string[]) {
        args = bindings;
        return stmt;
      },
      first: async () => sqlite.query(sql).get(...args),
    };
    return stmt;
  };
  // biome-ignore lint/suspicious/noExplicitAny: a fake of only the methods the gate calls.
  return { prepare } as any;
}

const GATED = { TEAM_EMAIL_DOMAINS: 'simplelocalweb.com' };

describe('mayProxyHost', () => {
  let db: D1Database;
  beforeEach(() => {
    const sqlite = new Database(':memory:');
    sqlite.exec('CREATE TABLE annotations (id TEXT PRIMARY KEY, ops TEXT, url TEXT)');
    sqlite.exec(
      "INSERT INTO annotations VALUES ('a', '[]', 'https://client.com/about'), ('b', '[]', 'https://bare.org')",
    );
    db = sqliteD1(sqlite);
  });
  afterEach(resetKnownHosts);

  test('ungated deployments proxy anything, as upstream does', async () => {
    expect(await mayProxyHost({ env: {}, host: 'evil.example' })).toBe(true);
  });

  test('a host with a board passes, in any case', async () => {
    expect(await mayProxyHost({ env: { ...GATED, DB: db }, host: 'client.com' })).toBe(true);
    expect(await mayProxyHost({ env: { ...GATED, DB: db }, host: 'CLIENT.com' })).toBe(true);
    expect(await mayProxyHost({ env: { ...GATED, DB: db }, host: 'bare.org' })).toBe(true);
  });

  test('a host without one is refused, lookalikes included', async () => {
    for (const host of ['evil.example', 'client.co', 'client.com.evil.example', 'bare.or']) {
      expect(await mayProxyHost({ env: { ...GATED, DB: db }, host })).toBe(false);
    }
  });

  test('a gated deployment with no database refuses rather than opening up', async () => {
    expect(await mayProxyHost({ env: GATED, host: 'client.com' })).toBe(false);
  });
});
