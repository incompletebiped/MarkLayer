// Read, not restated: the literal here silently fell three releases behind package.json before.
import {
  ConnectInput,
  callCreateTool,
  callRoomTool,
  err,
  fail,
  ok,
  type PreviewCreated,
  type PreviewRequest,
  parseRoomRef,
  TOOLS,
  type ToolContent,
} from '@marklayer/agent-tools';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { nanoid } from 'nanoid';
import { z } from 'zod/mini';
import { version } from '../package.json' with { type: 'json' };
import { RoomClient } from './room.js';

interface ServerOptions {
  apiBase: string;
  initialRoom: string | null;
  agentId: string;
  /** For a password-protected room. */
  password: string | null;
}

export async function startServer(opts: ServerOptions): Promise<void> {
  const server = new Server(
    { name: 'marklayer-mcp', title: 'Redline', version },
    {
      capabilities: { tools: {} },
      instructions:
        'Bridge between Redline annotations on a webpage and an AI coding agent. ' +
        'Call marklayer_connect_room first if no MARKLAYER_ROOM was provided at startup. ' +
        'Each annotation carries a `kind` (comment | area | selection | inspect) and, where available, ' +
        'a `target` block with the element selector + markdown — that is your handle for code changes; ' +
        'do not ask the user to repeat what was clicked. ' +
        'A selection annotation may also carry a `suggestion`: the exact text the reviewer wants in place of its ' +
        '`text`. Apply it verbatim rather than paraphrasing it. ' +
        'A comment (or a reply, from marklayer_get_annotation) may carry `attachments`: fetchable image URLs the ' +
        'reviewer attached — fetch and look at one before acting on a comment that has any, they often show the ' +
        'bug or the intended layout better than the text does. ' +
        'Typical loop: marklayer_list_annotations to backfill anything pending, then marklayer_watch_annotations ' +
        'in a loop. For each one: acknowledge, make the requested code changes, resolve with a summary. ' +
        'Use dismiss when an annotation cannot be acted on, with a reason the human can read. ' +
        'You can also work the other direction: if asked to review, audit, or give feedback on the page (bugs, UX ' +
        'or accessibility issues, ideas), inspect it with your own tools and call marklayer_create_annotation once ' +
        'per finding — do not bundle several into one comment. For an exact copy or grammar fix, use ' +
        'marklayer_suggest_edit instead of a comment, so the human gets a diff to accept rather than prose ' +
        'describing one.',
    },
  );

  let room: RoomClient | null = null;

  // The connected room's password; a new version of a protected room inherits it.
  let roomPassword = opts.password;

  const ensureRoom = (): RoomClient => {
    if (!room) {
      throw new Error('no room connected — call marklayer_connect_room first or set MARKLAYER_ROOM in the environment');
    }
    return room;
  };

  /** Open a preview room through the share API, then connect to it so the next tool works the new room. */
  const createPreview = async (request: PreviewRequest): Promise<PreviewCreated | { error: string }> => {
    let previous: string | undefined;
    try {
      previous = request.previous ? parseRoomRef(request.previous) : room?.roomId;
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'invalid previous room' };
    }
    const created = await postPreview({
      apiBase: opts.apiBase,
      request: { ...request, previous },
      agentId: opts.agentId,
      password: roomPassword,
    });
    if ('error' in created) return created;
    const next = new RoomClient({
      apiBase: opts.apiBase,
      roomId: created.id,
      agentId: opts.agentId,
      password: roomPassword,
    });
    await next.connect();
    room?.close();
    room = next;
    return created;
  };

  if (opts.initialRoom) {
    try {
      room = new RoomClient({
        apiBase: opts.apiBase,
        roomId: parseRoomRef(opts.initialRoom),
        agentId: opts.agentId,
        password: opts.password,
      });
      await room.connect();
    } catch (e) {
      console.error(`marklayer-mcp: failed to connect to initial room: ${(e as Error).message}`);
      room = null;
    }
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (req): Promise<ToolContent> => {
    const name = req.params.name;
    const rawArgs = req.params.arguments ?? {};
    try {
      // connect_room is the one tool that is not about a room's contents, so it
      // stays here: over HTTP the room is already named in the URL and there is
      // nothing to connect.
      if (name === 'marklayer_connect_room') {
        const parsed = ConnectInput.safeParse(rawArgs);
        if (!parsed.success) return fail(parsed.error);
        const id = parseRoomRef(parsed.data.room);
        if (room) room.close();
        // An explicit password wins; otherwise the startup one, which another room simply refuses.
        roomPassword = parsed.data.password ?? opts.password;
        room = new RoomClient({ apiBase: opts.apiBase, roomId: id, agentId: opts.agentId, password: roomPassword });
        await room.connect();
        return ok({ roomId: id, ...room.getMeta() });
      }

      const made = await callCreateTool({ name, args: rawArgs, createPreview, apiBase: opts.apiBase });
      if (made) return made;

      const r = ensureRoom();
      const handled = await callRoomTool({ name, args: rawArgs, room: r, apiBase: opts.apiBase });
      return handled ?? err(`unknown tool: ${name}`);
    } catch (e) {
      return err((e as Error).message);
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const cleanup = () => {
    if (room) {
      room.close();
      room = null;
    }
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

/** `POST /api/:id/preview` with a fresh id. The Worker validates the request again and owns the version chain. */
async function postPreview({
  apiBase,
  request,
  agentId,
  password,
}: {
  apiBase: string;
  request: PreviewRequest;
  agentId: string;
  /** Proves access to a protected `previous` room. */
  password: string | null;
}): Promise<PreviewCreated | { error: string }> {
  const id = nanoid();
  const res = await fetch(`${apiBase}/api/${id}/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(password ? { Authorization: `Bearer ${password}` } : {}) },
    body: JSON.stringify({ ...request, agent: agentId }),
  }).catch((e: unknown) => (e instanceof Error ? e : new Error(String(e))));
  if (res instanceof Error) return { error: `could not reach ${apiBase}: ${res.message}` };
  const body: unknown = await res.json().catch(() => null);
  const parsed = PreviewResponse.safeParse(body);
  if (res.ok && parsed.success) {
    return {
      id: parsed.data.id,
      link: parsed.data.url,
      version: parsed.data.version,
      previousId: parsed.data.previous,
    };
  }
  const reason = ErrorBody.safeParse(body);
  return { error: reason.success ? reason.data.error : `share API answered ${res.status}` };
}

const PreviewResponse = z.object({
  id: z.string(),
  url: z.string(),
  version: z.nullable(z.number()),
  previous: z.nullable(z.string()),
});
const ErrorBody = z.object({ error: z.string() });
