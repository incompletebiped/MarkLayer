import { type TeamEnv, teamGated } from './auth/team';

/**
 * Which hosts the proxy will serve as a page. Upstream proxies any public URL,
 * which on a team deployment lets anyone put a stranger's login form under our
 * domain. With the team gate on, a host must already have a board — and only
 * the team can start one on a new site — so the proxy shows sites we review.
 */
export interface ProxyGateEnv extends TeamEnv {
  DB?: D1Database;
}

/** Hosts seen with a board, so a page's dozens of requests cost one query. */
const knownHosts = new Map<string, number>();
const KNOWN_FOR_MS = 5 * 60_000;

export async function mayProxyHost({ env, host }: { env: ProxyGateEnv; host: string }): Promise<boolean> {
  if (!teamGated(env)) return true;
  if (!env.DB) return false;
  const h = host.toLowerCase();
  if ((knownHosts.get(h) ?? 0) > Date.now()) return true;
  // instr, not LIKE: `_` is legal in a hostname and a LIKE wildcard.
  const row = await env.DB.prepare(
    `SELECT 1 FROM annotations
     WHERE instr(url, ?1) = 1 OR instr(url, ?2) = 1 OR url = ?3 OR url = ?4
     LIMIT 1`,
  )
    .bind(`https://${h}/`, `http://${h}/`, `https://${h}`, `http://${h}`)
    .first();
  if (row) knownHosts.set(h, Date.now() + KNOWN_FOR_MS);
  return row !== null;
}

/** For tests: forget every host seen. */
export function resetKnownHosts(): void {
  knownHosts.clear();
}
