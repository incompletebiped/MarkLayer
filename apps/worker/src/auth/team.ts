import { userFromCookieHeader } from './session';

/**
 * Who may start a board. `TEAM_EMAIL_DOMAINS` is a comma-separated list of email
 * domains (`simplelocalweb.com`); a signed-in person at one of them can create
 * rooms, projects and previews, and everyone else can only work in rooms that
 * already exist — which is all a client opening a shared link ever needs.
 *
 * Unset means anyone may start one, which is upstream's behaviour and what the
 * tests and a fresh fork get.
 */
export interface TeamEnv {
  TEAM_EMAIL_DOMAINS?: string;
}

export function teamDomains(env: TeamEnv): string[] {
  return (env.TEAM_EMAIL_DOMAINS ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter((d) => d.length > 0);
}

/** True when starting a board is limited to the team, so an anonymous write may only update. */
export function teamGated(env: TeamEnv): boolean {
  return teamDomains(env).length > 0;
}

/** Whether this person (null when signed out) may start a new board. */
export function mayStartBoards({ env, email }: { env: TeamEnv; email: string | null | undefined }): boolean {
  const domains = teamDomains(env);
  if (domains.length === 0) return true;
  const domain = email?.toLowerCase().split('@')[1];
  return domain !== undefined && domains.includes(domain);
}

/** `mayStartBoards` for a request: reads the session cookie only when the gate is on. */
export async function requestMayStartBoards({
  env,
  cookie,
}: {
  env: TeamEnv & { DB: D1Database };
  cookie: string | undefined;
}): Promise<boolean> {
  if (!teamGated(env)) return true;
  const user = await userFromCookieHeader({ header: cookie ?? null, db: env.DB });
  return mayStartBoards({ env, email: user?.email });
}

/** What a refused create says, to a person in the app and to an agent alike. */
export const TEAM_ONLY = 'Only the team can start a new board here. Sign in with a team email address first.';
