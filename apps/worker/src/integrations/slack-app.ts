import type { CommentOp, DrawOp } from '@marklayer/types';
import { z } from 'zod/mini';
import { fromBase64, toBase64, toBase64Url } from '../http';
import { attachmentLinks, notifiableFrom, oneLine } from './types';

/**
 * The two-way Slack app: everything here is pure or a single Slack Web API call.
 * Routes live in slack-routes.ts, D1 in slack-store.ts, and the room's outbound
 * flush goes through `postBatchToSlack` in slack-sync.ts.
 */

/** The bindings the app reads. Any one unset turns the whole feature off. */
export interface SlackEnv {
  SLACK_CLIENT_ID?: string;
  SLACK_CLIENT_SECRET?: string;
  SLACK_SIGNING_SECRET?: string;
  /** Base64 of 32 random bytes: the AES-GCM key bot tokens are stored under. */
  SLACK_TOKEN_KEY?: string;
}

export interface SlackConfig {
  clientId: string;
  clientSecret: string;
  signingSecret: string;
  tokenKey: string;
}

export function slackConfig(env: SlackEnv): SlackConfig | null {
  const { SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, SLACK_SIGNING_SECRET, SLACK_TOKEN_KEY } = env;
  if (!SLACK_CLIENT_ID || !SLACK_CLIENT_SECRET || !SLACK_SIGNING_SECRET || !SLACK_TOKEN_KEY) return null;
  return {
    clientId: SLACK_CLIENT_ID,
    clientSecret: SLACK_CLIENT_SECRET,
    signingSecret: SLACK_SIGNING_SECRET,
    tokenKey: SLACK_TOKEN_KEY,
  };
}

/** Kept in step with the manifest in apps/worker/docs/slack-app.md. */
export const SLACK_SCOPES = [
  'chat:write',
  'channels:history',
  'groups:history',
  'channels:join',
  'users:read',
  'incoming-webhook',
] as const;

/** Slack's own replay window for a signed request. */
export const MAX_SIGNATURE_AGE_SECONDS = 5 * 60;

const encoder = new TextEncoder();

function fromHex(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

const hmacKey = (secret: string, usage: KeyUsage) =>
  crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);

/**
 * Whether a request really came from Slack, per its v0 signing scheme.
 *
 * `subtle.verify` rather than comparing hex strings: it is constant-time, and it
 * is the one comparison available both in workerd and under `bun test`.
 */
export async function verifySlackSignature({
  signingSecret,
  timestamp,
  signature,
  body,
  now = Date.now(),
}: {
  signingSecret: string;
  timestamp: string | null;
  signature: string | null;
  body: string;
  now?: number;
}): Promise<boolean> {
  if (!timestamp || !signature?.startsWith('v0=') || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > MAX_SIGNATURE_AGE_SECONDS) return false;
  const given = fromHex(signature.slice(3));
  if (!given) return false;
  const key = await hmacKey(signingSecret, 'verify');
  return crypto.subtle.verify('HMAC', key, given, encoder.encode(`v0:${timestamp}:${body}`));
}

/** The header value Slack would send for this body; used by tests and nothing else in production. */
export async function signSlackBody({
  signingSecret,
  timestamp,
  body,
}: {
  signingSecret: string;
  timestamp: string;
  body: string;
}): Promise<string> {
  const key = await hmacKey(signingSecret, 'sign');
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`v0:${timestamp}:${body}`)));
  return `v0=${[...mac].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/** How long an install may sit on Slack's consent screen before the state is refused. */
export const STATE_TTL_SECONDS = 10 * 60;

const statePayload = z.object({ r: z.string(), u: z.nullable(z.string()), n: z.string(), e: z.number() });
export type InstallState = { roomId: string; userId: string | null; nonce: string };

/**
 * The OAuth `state`: room, installer and a nonce, HMAC'd under the client secret.
 * The nonce is also set as a cookie, so a state lifted from one browser cannot
 * complete an install in another.
 */
export async function signInstallState({
  secret,
  state,
  now = Date.now(),
}: {
  secret: string;
  state: InstallState;
  now?: number;
}): Promise<string> {
  const payload = toBase64Url(
    encoder.encode(
      JSON.stringify({
        r: state.roomId,
        u: state.userId,
        n: state.nonce,
        e: Math.floor(now / 1000) + STATE_TTL_SECONDS,
      }),
    ),
  );
  const key = await hmacKey(secret, 'sign');
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
  return `${payload}.${toBase64Url(mac)}`;
}

export async function verifyInstallState({
  secret,
  value,
  now = Date.now(),
}: {
  secret: string;
  value: string | null;
  now?: number;
}): Promise<InstallState | null> {
  const [payload, mac, extra] = (value ?? '').split('.');
  if (!payload || !mac || extra !== undefined) return null;
  const macBytes = fromBase64(mac);
  const payloadBytes = fromBase64(payload);
  if (!macBytes || !payloadBytes) return null;
  const key = await hmacKey(secret, 'verify');
  if (!(await crypto.subtle.verify('HMAC', key, macBytes, encoder.encode(payload)))) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return null;
  }
  const parsed = statePayload.safeParse(raw);
  if (!parsed.success || parsed.data.e < now / 1000) return null;
  return { roomId: parsed.data.r, userId: parsed.data.u, nonce: parsed.data.n };
}

async function tokenKey(secret: string): Promise<CryptoKey | null> {
  const raw = fromBase64(secret);
  if (raw?.length !== 32) return null;
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** `base64(iv ‖ ciphertext)`, with the room id as associated data so a row cannot be moved to another room. */
export async function encryptToken({
  secret,
  token,
  roomId,
}: {
  secret: string;
  token: string;
  roomId: string;
}): Promise<string> {
  const key = await tokenKey(secret);
  if (!key) throw new Error('SLACK_TOKEN_KEY must be base64 of 32 bytes');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(roomId) },
    key,
    encoder.encode(token),
  );
  const out = new Uint8Array(iv.length + sealed.byteLength);
  out.set(iv);
  out.set(new Uint8Array(sealed), iv.length);
  return toBase64(out);
}

export async function decryptToken({
  secret,
  sealed,
  roomId,
}: {
  secret: string;
  sealed: string;
  roomId: string;
}): Promise<string | null> {
  const key = await tokenKey(secret);
  const bytes = fromBase64(sealed);
  if (!key || !bytes || bytes.length < 13) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: encoder.encode(roomId) },
      key,
      bytes.slice(12),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

/** Slack's escaping for message text: these three, and nothing else. */
const escapeMrkdwn = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** A human's Slack reply as plain comment text: links and mentions unwrapped, entities decoded. */
export function plainFromMrkdwn(text: string): string {
  return text
    .replace(/<(?:https?|mailto):[^|>]+\|([^>]+)>/g, '$1')
    .replace(/<((?:https?|mailto):[^>]+)>/g, '$1')
    .replace(/<@[A-Z0-9]+(?:\|([^>]+))?>/g, (_, name?: string) => `@${name ?? 'someone'}`)
    .replace(/<#[A-Z0-9]+\|([^>]*)>/g, '#$1')
    .replace(/<!(here|channel|everyone)(?:\|[^>]*)?>/g, '@$1')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .trim();
}

/** A new annotation as a thread parent: who, what kind, the words, and the way back to the room. */
export function parentMessage({ op, roomUrl, origin }: { op: DrawOp; roomUrl: string; origin: string }): string | null {
  const item = notifiableFrom(op);
  if (!item) return null;
  const priority = item.priority ? ` \`${item.priority}\`` : '';
  return [
    `*${escapeMrkdwn(item.author)}* — ${item.kind}${priority}: ${escapeMrkdwn(oneLine(item.text))}`,
    ...(attachmentLinks({ item, roomUrl: origin }) ?? []),
    `<${roomUrl}|Open in Redline>`,
  ].join('\n');
}

export function replyMessage({ op, origin }: { op: CommentOp; origin: string }): string | null {
  const item = notifiableFrom(op);
  if (!item) return null;
  return [
    `*${escapeMrkdwn(item.author)}*: ${escapeMrkdwn(item.text.trim())}`,
    ...(attachmentLinks({ item, roomUrl: origin }) ?? []),
  ].join('\n');
}

/** Op ids for Slack-born replies are derived from the message, so a redelivered event writes nothing new. */
export const slackOpId = ({ channel, ts }: { channel: string; ts: string }) =>
  `slack-${channel}-${ts.replace('.', '_')}`;

/** Every op this app writes into a room starts with this, which is how the room keeps it out of the outbound queue. */
export const isSlackOp = (op: DrawOp) => op.id.startsWith('slack-');

const messageEvent = z.object({
  type: z.literal('message'),
  channel: z.string(),
  ts: z.string(),
  text: z.optional(z.string()),
  user: z.optional(z.string()),
  thread_ts: z.optional(z.string()),
  subtype: z.optional(z.string()),
  bot_id: z.optional(z.string()),
});

const messageCallback = z.object({
  type: z.literal('event_callback'),
  team_id: z.string(),
  event: messageEvent,
});

export type InboundReply = {
  teamId: string;
  channel: string;
  threadTs: string;
  ts: string;
  user: string;
  text: string;
};

/**
 * A human reply in a thread, or null for everything else Slack sends.
 *
 * Any `bot_id` or `subtype` is dropped: our own posts carry `bot_id`, and
 * edits, deletes and joins are subtypes. That is what stops a reply we post from
 * coming back in as a new one. The bot-user check against the install happens
 * in the route, where the install is known.
 */
export function inboundReply(body: unknown): InboundReply | null {
  const envelope = messageCallback.safeParse(body);
  if (!envelope.success) return null;
  const { channel, ts, text, user, thread_ts, subtype, bot_id } = envelope.data.event;
  if (bot_id || subtype || !user || !thread_ts || thread_ts === ts) return null;
  const plain = plainFromMrkdwn(text ?? '');
  if (!plain) return null;
  return { teamId: envelope.data.team_id, channel, threadTs: thread_ts, ts, user, text: plain };
}

const workspaceGone = z.object({
  type: z.literal('event_callback'),
  team_id: z.string(),
  event: z.object({ type: z.enum(['app_uninstalled', 'tokens_revoked']) }),
});

/** The workspace whose installs should be forgotten, if this event says so. */
export function uninstalledTeam(body: unknown): string | null {
  const parsed = workspaceGone.safeParse(body);
  return parsed.success ? parsed.data.team_id : null;
}

const SLACK_API = 'https://slack.com/api';
const TIMEOUT_MS = 5000;

const okResponse = z.object({ ok: z.boolean(), error: z.optional(z.string()) });

/** One Web API call. Never throws: a transport failure reads as `{ ok: false }`. */
async function call({
  method,
  token,
  body,
}: {
  method: string;
  token?: string;
  body: Record<string, string | boolean> | URLSearchParams;
}): Promise<unknown> {
  try {
    const res = await fetch(`${SLACK_API}/${method}`, {
      method: 'POST',
      headers: {
        'Content-Type':
          body instanceof URLSearchParams ? 'application/x-www-form-urlencoded' : 'application/json; charset=utf-8',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body instanceof URLSearchParams ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'manual',
    });
    return await res.json();
  } catch {
    return { ok: false, error: 'unreachable' };
  }
}

const postResult = z.object({ ok: z.literal(true), ts: z.string() });

export async function postMessage({
  token,
  channel,
  text,
  threadTs,
}: {
  token: string;
  channel: string;
  text: string;
  threadTs?: string;
}): Promise<string | null> {
  const body: Record<string, string | boolean> = { channel, text, unfurl_links: false };
  if (threadTs) body.thread_ts = threadTs;
  const parsed = postResult.safeParse(await call({ method: 'chat.postMessage', token, body }));
  return parsed.success ? parsed.data.ts : null;
}

const accessResult = z.object({
  ok: z.literal(true),
  access_token: z.string(),
  bot_user_id: z.string(),
  team: z.object({ id: z.string(), name: z.optional(z.string()) }),
  incoming_webhook: z.object({ channel_id: z.string(), channel: z.optional(z.string()) }),
});
export type SlackAccess = z.infer<typeof accessResult>;

export async function exchangeCode({
  config,
  code,
  redirectUri,
}: {
  config: SlackConfig;
  code: string;
  redirectUri: string;
}): Promise<SlackAccess | { ok: false; error: string }> {
  const raw = await call({
    method: 'oauth.v2.access',
    body: new URLSearchParams({
      code,
      redirect_uri: redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });
  const parsed = accessResult.safeParse(raw);
  if (parsed.success) return parsed.data;
  const failure = okResponse.safeParse(raw);
  return { ok: false, error: (failure.success && failure.data.error) || 'unexpected response' };
}

/** Best effort: a public channel is joined so its replies reach us; a private one needs `/invite`. */
export async function joinChannel({ token, channel }: { token: string; channel: string }): Promise<void> {
  await call({ method: 'conversations.join', token, body: { channel } });
}

const userResult = z.object({
  ok: z.literal(true),
  user: z.object({
    name: z.optional(z.string()),
    real_name: z.optional(z.string()),
    profile: z.optional(z.object({ display_name: z.optional(z.string()), real_name: z.optional(z.string()) })),
  }),
});

/** The name a person goes by in Slack, or a stand-in when the lookup fails. */
export async function displayName({ token, user }: { token: string; user: string }): Promise<string> {
  const parsed = userResult.safeParse(await call({ method: 'users.info', token, body: new URLSearchParams({ user }) }));
  if (!parsed.success) return 'Slack user';
  const u = parsed.data.user;
  return u.profile?.display_name || u.profile?.real_name || u.real_name || u.name || 'Slack user';
}

export const authorizeUrl = ({
  config,
  redirectUri,
  state,
}: {
  config: SlackConfig;
  redirectUri: string;
  state: string;
}) =>
  `https://slack.com/oauth/v2/authorize?${new URLSearchParams({
    client_id: config.clientId,
    scope: SLACK_SCOPES.join(','),
    redirect_uri: redirectUri,
    state,
  })}`;
