<p align="center">
  <a href="https://redline.simplelocalweb.com">
    <img src="apps/worker/static/favicon.svg" width="96" height="96" alt="Redline logo">
  </a>
</p>

<h1 align="center">Redline</h1>

<p align="center"><strong>Mark it in red. We'll knock it out.</strong></p>

<p align="center">
  The website feedback tool from <a href="https://simplelocalweb.com">Simple Local Web</a>. Clients open their site, circle what they want changed right on the page, and watch each mark get checked off.
</p>

<p align="center">
  <a href="https://redline.simplelocalweb.com"><strong>Open Redline</strong></a> ·
  <a href="#how-it-differs-from-marklayer">What's different</a> ·
  <a href="#development">Development</a> ·
  <a href="#deploying">Deploying</a>
</p>

## What it is

Redline is a fork of [MarkLayer](https://github.com/thevrus/MarkLayer), an open-source tool for annotating any webpage. It's set up for one team working with its clients:

1. **The team starts a redline** for a client's site from the dashboard.
2. **The client gets a link.** They open their own site inside Redline, circle a photo, point at a button, flag a typo, or leave a comment. No account or extension needed.
3. **Every mark lands on the team's list.** Pins are red while open and turn navy once resolved, so the client sees progress without asking.

An AI coding agent can work the same list over MCP: every board link answers at `/s/:id/mcp`. See [apps/mcp](apps/mcp/README.md) for the tools.

## How it differs from MarkLayer

- **Team-only boards.** Only people signed in at a `TEAM_EMAIL_DOMAINS` address can start a board. Clients work in the boards they're sent.
- **One redline per site.** A board covers a whole site, not one page. New pages inherit the board's owner, access, expiry and password, and the viewer has a page picker plus a *This page / All pages* comments view.
- **Client mode.** Clients get Move and Comment, plus devices, zoom, presence, sharing and theme. Drawing tools, export, voice, link settings and page management stay with the team.
- **Boards belong to their creator**, and display names follow the account across devices.
- **Desktop by default.** New pages open at a 1440px width, whatever the size of the window that opened them.
- **A gated proxy.** The page proxy only serves sites that have a board, so the domain can't be used to serve arbitrary pages.
- **Delete deletes.** Removing a board from the dashboard deletes every page of the site, instead of waiting for the 90-day cleanup.
- **Redline branding** (navy and red, Public Sans and Barlow Condensed), a trimmed marketing site (home, privacy, help, `/mcp`), and no donation or Chrome extension prompts.

Internal identifiers (`marklayer_*` MCP tools, `@marklayer/*` packages, `ml-` classes, the `marklayer` worker and D1 database) keep their upstream names, so upstream changes still merge cleanly.

## Development

Requires [Bun](https://bun.sh).

~~~bash
bun install
bun run dev
~~~

| Command | What it does |
|---|---|
| `bun run dev` | Run every app in development mode |
| `bun run build` | Build all apps |
| `bun run check` | Type-check the workspace |
| `bun run test` | Run the test suites |
| `bun run lint` | Lint and format-check with Biome |
| `bun run lint:fix` | Apply lint and formatting fixes |

Database changes go in a new file under `apps/worker/migrations/`, applied with:

~~~bash
cd apps/worker
bunx wrangler d1 migrations apply marklayer --local    # dev
bunx wrangler d1 migrations apply marklayer --remote   # production
~~~

[`CLAUDE.md`](CLAUDE.md) has the full architecture notes and code conventions.

### Repository layout

~~~
├── apps/worker/            Cloudflare Worker: API, real-time rooms, proxy, share cards, web app
├── apps/site/              Static marketing pages (Astro), embedded in the worker at build time
├── apps/mcp/               MCP server for AI agents (stdio package)
├── apps/extension/         Browser extension (WXT + Preact); its components also power the web viewer
├── apps/fetcher/           Optional fixed-IP relay for hosts that block Cloudflare
├── packages/types/         Shared types and Zod schemas
├── packages/agent-tools/   Agent tool contract shared by both MCP transports
└── packages/emails/        Sign-in and invite email templates
~~~

## Deploying

Redline deploys from the `deploy/simplelocalweb` branch to Cloudflare Workers at [redline.simplelocalweb.com](https://redline.simplelocalweb.com). `main` tracks upstream MarkLayer.

~~~bash
bun run deploy   # builds the site and worker, then runs wrangler deploy
~~~

`wrangler` needs a Cloudflare API token with Workers access in `CLOUDFLARE_API_TOKEN`. Bindings (D1, Durable Objects, R2, email) and the team-domain setting live in [`apps/worker/wrangler.jsonc`](apps/worker/wrangler.jsonc).

## License and credit

Redline is built on [MarkLayer](https://github.com/thevrus/MarkLayer) by [Dean Rusin](https://github.com/thevrus), and is released under the same [Apache License 2.0](LICENSE).
