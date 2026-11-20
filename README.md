# Zen

A quiet view of your Todoist, styled after [asker.dev](https://asker.dev): one narrow column,
Public Sans for reading, Departure Mono for the chrome, near-monochrome.

Todoist is the source of truth. Everything you do here writes straight back.

## What it does

- **Today, Upcoming, Inbox, Projects.** These read like Todoist, minus the clutter.
- **Deep / shallow.** Deep work fills the main column. Shallow work (tasks labeled `@shallow` in
  Todoist) collects in a column beside it, with a running tally like "6 · ~55 min" to batch
  into one block. Drag a task across, or press `s`, and the label is written to Todoist.
- **Priority.** An urgent/important matrix: P1 Do, P2 Schedule, P3 Delegate, P4 Triage. It's a
  2×2 on desktop (important on top, urgent on the left) and a single column on phones. Drag a task to another group and the new priority
  saves to Todoist on drop, with Undo. On a phone, long-press to drag. Scope it to
  *Due today*, *Next 7 days* or *Everything*.
- **Write back.** You can complete a task, edit its title, notes, due date (natural language,
  e.g. "every mon 9am"), priority, project or labels, and delete it.
- **Quick add.** Uses Todoist's own parser (`tomorrow 3pm #Work @deep p1`). A task added inside
  a project or section lands there unless you type a `#project`.
- **Keyboard.** `j`/`k` move, `x` completes, `e` edits, `1`–`4` set priority, `n` adds a task,
  `s` toggles shallow/deep, `t u i p o` switch views, `r` syncs, `?` lists the keys.

## How it works

It is a static front end plus a small relay in `api/` that runs as Vercel functions.

- **The token stays on the server.** `TODOIST_API_TOKEN` is an environment variable. The relay
  adds it to requests going to the [Todoist API v1](https://developer.todoist.com/api/v1/). It
  never reaches the browser.
- **The site is password-protected.** The token gives full access to your Todoist, so the relay
  answers only signed-in visitors. Sign in once per device with `APP_PASSWORD` and a session
  cookie (HttpOnly, SameSite=Strict) keeps you signed in for a year. Changing `APP_PASSWORD`
  signs out every device.
- **Reads** use `/sync`: one full sync, then incremental syncs every 30 seconds and whenever the
  tab regains focus.
- **Writes** are `/sync` commands (`item_update`, `item_close`, `item_move`, …). They are
  applied on screen immediately and confirmed by Todoist. If Todoist rejects one, the app shows
  the error and resyncs from scratch.

## Deploy on Vercel

1. Import this repo as a Vercel project. `vercel.json` sets the build and security headers.
2. Under **Settings → Environment Variables**, add:
   - `TODOIST_API_TOKEN`: from Todoist → Settings → Integrations → Developer.
   - `APP_PASSWORD`: any password you choose.
3. Redeploy so the variables take effect.

Until both are set, the site shows a setup page naming whichever is missing.

## Run it locally

Create `.env.local` (it's git-ignored):

```
TODOIST_API_TOKEN=your-token
APP_PASSWORD=anything
```

```bash
npm install
```

```bash
npm run dev
```

The dev server serves the same `/api` routes. **Try with sample data** works without either
variable.

```bash
npm test
```

## Agents

`docs/agent-prompt.md` is the prompt for AI agents that add tasks to Todoist. It covers how they
guess priority and depth (`@shallow`) so tasks land in the right place here.

## Credits

The visual language follows [asker.dev](https://asker.dev). The fonts are
[Public Sans](https://public-sans.digital.gov) (OFL) and
[Departure Mono](https://departuremono.com) (OFL, see `public/fonts/DepartureMono-LICENSE.txt`).
