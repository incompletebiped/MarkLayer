import type { Folder, LinkAccess, OwnedLink } from '@marklayer/types';
import { nanoid } from 'nanoid';
import { isExpired, nowInSeconds, parseLinkAccess, throttleRemaining } from '../store';
import { hashToken } from './tokens';
import { LOGIN_TOKEN_TTL_SECONDS, SEEN_BUMP_SECONDS, SESSION_TTL_SECONDS, type User } from './types';

/**
 * One factory per concern, mirroring `store.ts` — the caller passes the D1
 * binding rather than the module reaching for it, which is what keeps these
 * testable against a fake database.
 */
export function authStore(db: D1Database) {
  return {
    /**
     * Records a pending sign-in. Returns the seconds until the caller may ask
     * again, or 0 when the request should proceed: one unredeemed link per
     * address per window, so a form left on repeat cannot drain the send quota
     * or bury someone's inbox.
     */
    async throttleSeconds(email: string): Promise<number> {
      const row = await db
        .prepare(
          'SELECT created_at FROM login_tokens WHERE email = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1',
        )
        .bind(email)
        .first<{ created_at: number }>();
      return throttleRemaining(row?.created_at);
    },

    async createLoginToken({ email, token }: { email: string; token: string }): Promise<void> {
      await db
        .prepare('INSERT INTO login_tokens (id, email, expires_at) VALUES (?, ?, ?)')
        .bind(await hashToken(token), email, nowInSeconds() + LOGIN_TOKEN_TTL_SECONDS)
        .run();
    },

    /**
     * Consumes a magic link, returning the address it was issued to.
     *
     * The UPDATE carries the single-use check in its WHERE clause rather than
     * reading first and writing after: two tabs opening the same link race, and
     * only the one whose write matches a row may proceed. RETURNING makes that
     * one round trip, and the winner is the one that gets a row back.
     */
    async redeemLoginToken(token: string): Promise<string | null> {
      const now = nowInSeconds();
      const row = await db
        .prepare(
          'UPDATE login_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL AND expires_at > ? RETURNING email',
        )
        .bind(now, await hashToken(token), now)
        .first<{ email: string }>();
      return row?.email ?? null;
    },

    /**
     * Sign-in is also sign-up: there is no separate registration step to abandon.
     *
     * One upsert rather than a read-then-write, so two links redeemed at once
     * cannot both decide the account is new. The generated id is discarded on
     * conflict — `email` is UNIQUE, so the existing row's id comes back instead.
     */
    async upsertUser(email: string): Promise<User | null> {
      const row = await db
        .prepare(
          'INSERT INTO users (id, email) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET last_seen_at = ? RETURNING id, email',
        )
        .bind(nanoid(), email, nowInSeconds())
        .first<User>();
      return row;
    },

    async createSession({ userId, token }: { userId: string; token: string }): Promise<void> {
      await db
        .prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
        .bind(await hashToken(token), userId, nowInSeconds() + SESSION_TTL_SECONDS)
        .run();
    },

    /**
     * Resolves a session, and keeps `users.last_seen_at` meaning what it says.
     *
     * A session lasts 30 days, so before this the column only moved when someone
     * redeemed a magic link: it recorded re-authentication, not use, and a
     * return-rate read off it was near zero by construction. Bumped at most once
     * a day per user, which is why the SELECT carries the column at all.
     */
    async userForSession(token: string): Promise<User | null> {
      const row = await db
        .prepare(
          'SELECT users.id AS id, users.email AS email, users.name AS name, users.last_seen_at AS last_seen_at, sessions.expires_at AS expires_at FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.id = ?',
        )
        .bind(await hashToken(token))
        .first<{ id: string; email: string; name: string | null; last_seen_at: number | null; expires_at: number }>();
      if (!row || isExpired(row.expires_at)) return null;
      const now = nowInSeconds();
      if ((row.last_seen_at ?? 0) < now - SEEN_BUMP_SECONDS) {
        await db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').bind(now, row.id).run();
      }
      return { id: row.id, email: row.email, name: row.name ?? null };
    },

    async setName({ id, name }: { id: string; name: string }): Promise<void> {
      await db.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, id).run();
    },

    async deleteSession(token: string): Promise<void> {
      await db
        .prepare('DELETE FROM sessions WHERE id = ?')
        .bind(await hashToken(token))
        .run();
    },

    /** Called by the existing retention cron; expired rows are dead weight, not history. */
    async sweepExpired(): Promise<void> {
      const now = nowInSeconds();
      await db.batch([
        db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
        db.prepare('DELETE FROM login_tokens WHERE expires_at < ?').bind(now),
      ]);
    },
  };
}

/** Links a person has claimed, most recently touched first. */
export function ownedStore(db: D1Database) {
  return {
    async listAnnotations(ownerId: string): Promise<OwnedLink[]> {
      const res = await db
        .prepare(
          'SELECT id, url, created_at, last_accessed_at, expires_at, access, owner_expires_at, folder_id, password_hash IS NOT NULL AS password_protected FROM annotations WHERE owner_id = ? ORDER BY last_accessed_at DESC LIMIT 200',
        )
        .bind(ownerId)
        .all<{
          id: string;
          url: string | null;
          created_at: number;
          last_accessed_at: number;
          expires_at: number | null;
          access: string;
          owner_expires_at: number | null;
          folder_id: string | null;
          password_protected: number | null;
        }>();
      // Mapped here, not at the caller: snake_case is D1's shape and it should
      // stop at this boundary, the way it does in `store.ts`.
      return res.results.map((row) => ({
        id: row.id,
        url: row.url,
        createdAt: row.created_at,
        lastAccessedAt: row.last_accessed_at,
        expiresAt: row.expires_at,
        access: parseLinkAccess(row.access),
        ownerExpiresAt: row.owner_expires_at,
        folderId: row.folder_id,
        // SQLite answers the IS NOT NULL as 0/1.
        passwordProtected: row.password_protected === 1,
      }));
    },

    /**
     * Sets, replaces or (with `hash: null`) removes the password, bumping the
     * generation every time so each unlock cookie issued before it stops working.
     * Returns the new generation, or null when this session does not own the link.
     */
    async setPassword({
      id,
      ownerId,
      hash,
    }: {
      id: string;
      ownerId: string;
      hash: string | null;
    }): Promise<number | null> {
      const row = await db
        .prepare(
          'UPDATE annotations SET password_hash = ?, password_gen = password_gen + 1 WHERE id = ? AND owner_id = ? RETURNING password_gen',
        )
        .bind(hash, id, ownerId)
        .first<{ password_gen: number }>();
      return row?.password_gen ?? null;
    },

    /** A claimed link's settings, or null when this session does not own it. */
    async getSettings({
      id,
      ownerId,
    }: {
      id: string;
      ownerId: string;
    }): Promise<{ access: LinkAccess; ownerExpiresAt: number | null } | null> {
      const row = await db
        .prepare('SELECT access, owner_expires_at FROM annotations WHERE id = ? AND owner_id = ?')
        .bind(id, ownerId)
        .first<{ access: string; owner_expires_at: number | null }>();
      if (!row) return null;
      return { access: parseLinkAccess(row.access), ownerExpiresAt: row.owner_expires_at };
    },

    /** Takes resolved values — the route decides what a partial PATCH means. */
    async updateSettings({
      id,
      ownerId,
      access,
      ownerExpiresAt,
    }: {
      id: string;
      ownerId: string;
      access: LinkAccess;
      ownerExpiresAt: number | null;
    }): Promise<boolean> {
      const res = await db
        .prepare('UPDATE annotations SET access = ?, owner_expires_at = ? WHERE id = ? AND owner_id = ?')
        .bind(access, ownerExpiresAt, id, ownerId)
        .run();
      return (res.meta.changes ?? 0) > 0;
    },

    /**
     * Claims an unowned link. The `owner_id IS NULL` guard is the whole
     * authorization model: anyone holding the id may claim it once, and nobody
     * can take one that is already claimed.
     */
    async claimAnnotation({ id, ownerId }: { id: string; ownerId: string }): Promise<boolean> {
      const res = await db
        .prepare('UPDATE annotations SET owner_id = ? WHERE id = ? AND owner_id IS NULL')
        .bind(ownerId, id)
        .run();
      return (res.meta.changes ?? 0) > 0;
    },

    /**
     * Also resets `access`, `owner_expires_at` and the password: all are
     * owner-managed settings, and with `owner_id` gone
     * `getSettings`'s `AND owner_id = ?` guard would make either permanent —
     * nobody could ever reach the PATCH that undoes them.
     */
    async releaseAnnotation({ id, ownerId }: { id: string; ownerId: string }): Promise<boolean> {
      const res = await db
        .prepare(
          "UPDATE annotations SET owner_id = NULL, access = 'edit', owner_expires_at = NULL, folder_id = NULL, password_hash = NULL, password_gen = password_gen + 1 WHERE id = ? AND owner_id = ?",
        )
        .bind(id, ownerId)
        .run();
      return (res.meta.changes ?? 0) > 0;
    },

    /**
     * Files a link, or unfiles it with `folderId: null`. Both halves are
     * owner-guarded in one statement: a guessed folder id must not file a link
     * into someone else's list.
     */
    async moveAnnotation({
      id,
      ownerId,
      folderId,
    }: {
      id: string;
      ownerId: string;
      folderId: string | null;
    }): Promise<boolean> {
      const res = await db
        .prepare(
          `UPDATE annotations SET folder_id = ? WHERE id = ? AND owner_id = ?
           AND (? IS NULL OR EXISTS (SELECT 1 FROM folders WHERE id = ? AND owner_id = ?))`,
        )
        .bind(folderId, id, ownerId, folderId, folderId, ownerId)
        .run();
      return (res.meta.changes ?? 0) > 0;
    },
  };
}

/** Every statement carries `owner_id`, so a folder id alone reaches nothing. */
export function folderStore(db: D1Database) {
  return {
    async list(ownerId: string): Promise<Folder[]> {
      const res = await db
        .prepare('SELECT id, name, created_at FROM folders WHERE owner_id = ? ORDER BY name COLLATE NOCASE')
        .bind(ownerId)
        .all<{ id: string; name: string; created_at: number }>();
      return res.results.map((row) => ({ id: row.id, name: row.name, createdAt: row.created_at }));
    },

    async create({ ownerId, name }: { ownerId: string; name: string }): Promise<Folder> {
      const folder = { id: nanoid(), name, createdAt: nowInSeconds() };
      await db
        .prepare('INSERT INTO folders (id, owner_id, name, created_at) VALUES (?, ?, ?, ?)')
        .bind(folder.id, ownerId, name, folder.createdAt)
        .run();
      return folder;
    },

    async rename({ id, ownerId, name }: { id: string; ownerId: string; name: string }): Promise<boolean> {
      const res = await db
        .prepare('UPDATE folders SET name = ? WHERE id = ? AND owner_id = ?')
        .bind(name, id, ownerId)
        .run();
      return (res.meta.changes ?? 0) > 0;
    },

    /** Its links fall back to unfiled; none are deleted. */
    async remove({ id, ownerId }: { id: string; ownerId: string }): Promise<boolean> {
      await db
        .prepare('UPDATE annotations SET folder_id = NULL WHERE folder_id = ? AND owner_id = ?')
        .bind(id, ownerId)
        .run();
      const res = await db.prepare('DELETE FROM folders WHERE id = ? AND owner_id = ?').bind(id, ownerId).run();
      return (res.meta.changes ?? 0) > 0;
    },
  };
}
