# Zen

A quiet view of your Todoist, styled after [asker.dev](https://asker.dev): one narrow column,
Public Sans for reading, Departure Mono for the chrome, near-monochrome.

Todoist is the source of truth. Everything you do here writes straight back.

## What it does

- **Today, Upcoming, Inbox, Projects.** These read like Todoist, minus the clutter.
- **Priority.** Tasks are grouped P1–P4. Drag a task to another group and the new priority
  saves to Todoist on drop, with Undo. On a phone, long-press to drag. Scope it to
  *Due today*, *Next 7 days* or *Everything*.
- **Write back.** You can complete a task, edit its title, notes, due date (natural language,
  e.g. "every mon 9am"), priority, project or labels, and delete it.
- **Quick add.** Uses Todoist's own parser (`tomorrow 3pm #Work @deep p1`). A task added inside
  a project or section lands there unless you type a `#project`.
- **Keyboard.** `j`/`k` move, `x` completes, `e` edits, `1`–`4` set priority, `n` adds a task,
  `t u i p o` switch views, `?` lists the keys.

## How it works

It is a static site with no backend. The browser talks to the
[Todoist API v1](https://developer.todoist.com/api/v1/) directly.

- Reads use the `/sync` endpoint: one full sync, then incremental syncs every 30 seconds and
  whenever the tab regains focus.
- Writes are `/sync` commands (`item_update`, `item_close`, `item_move`, …). They are
  applied on screen immediately and confirmed by Todoist. If Todoist rejects one, the app
  shows the error and resyncs from scratch.
- Your API token is kept in this browser's `localStorage` and sent only to `api.todoist.com`.
  The deployed site's Content-Security-Policy blocks requests to anywhere else.

## Run it

```bash
npm install
npm run dev
```

Open the printed URL. Paste your token from Todoist → Settings → Integrations → Developer, or
choose **Try with sample data**.

```bash
npm test
```

```bash
npm run build
```

## Deploy

This is a plain Vite build, so any static host works. `vercel.json` sets up Vercel, including the
security headers. Since the token lives in each visitor's own browser, sharing the URL never
shares your Todoist.

## Credits

The visual language follows [asker.dev](https://asker.dev). The fonts are
[Public Sans](https://public-sans.digital.gov) (OFL) and
[Departure Mono](https://departuremono.com) (OFL, see `public/fonts/DepartureMono-LICENSE.txt`).
