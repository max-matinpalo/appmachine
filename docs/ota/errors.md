# Errors and crashes

Plan: apps report their JS errors and crashes to the AppMachine server with no app code; the Admin GUI and agents read them.

## Goals

- Zero setup: every published bundle reports, through the updater script `appmachine.js` that publish already injects.
- One call for anything else: `APPMACHINE.report(error, extra)` for caught errors and bug reports.
- Works offline: reports wait on the device and go out later.
- Each report says where: release (and so commit), device specs, page path.
- Readable for agents too, so they can find and fix bugs from the API.

## Kinds

| Kind | Source |
|---|---|
| `crash` | Uncaught error before ready (2 s after `load`); the same launch counts toward the trial's [rollback](overview.md#activation-and-rollback) |
| `error` | Uncaught error after ready (`error` event on `window`) |
| `rejection` | `unhandledrejection` |
| `report` | `APPMACHINE.report(error, extra)` from app code |

- Native crashes of the iOS and Android shells: not covered; App Store Connect and Play Console show them.

## Client

- `appmachine.js` listens to `error` and `unhandledrejection` from its first line, so errors in app startup are caught too.
- Report: `{ time, kind, release, message, stack, source, path, extra }`; `release` is the running one, `source` is `file:line:col`, `path` the page path.
- The same message and source within one launch: one report with a `count`.
- Queue: cache entry `/appmachine/errors`, at most 20 reports, oldest dropped.
- Sending: 1 s after the last new report, and with the reports flush on each launch; a failure keeps the queue.
- Limits: `message` 1 KB, `stack` 8 KB, `extra` 2 KB as JSON; longer is cut.

## Server

- `POST /_ota/errors` on app hosts: `{ device, errors: [...] }`, at most 20; 204.
- Table `errors`: `id`, `channel`, `release`, `device`, `kind`, `message`, `stack`, `source`, `path`, `extra`, `count`, `time`, `group`.
- `group`: SHA-256 of `kind`, `message` with numbers removed and `source` without the hashed file name, so one bug in many releases is one group.
- Keeps 90 days and at most 10,000 rows; older go first.
- `GET /api/errors`: groups, last seen first: `{ group, kind, message, source, count, devices, releases, first, last }`.
- `GET /api/errors/<group>`: its latest 50 reports with device specs from `devices`.

## Admin GUI

- View Errors next to Releases and Devices.
- A table of groups: message, kind, source, count, devices, releases, last seen; filter by channel and release.
- A group shows its reports: time, release, device (model, system, browser), path, stack, extra.
- The Releases cards show each release's crash and error counts.

## Privacy

- No IP addresses, no cookies, no page content; country only, as in [devices](server.md#storage).
- Apps must not put personal data into `extra`.

## Later

- Source maps: publish uploads hidden maps (`build.sourcemap: 'hidden'`), the server resolves stacks to source lines; meanwhile build the release's commit locally.
- New error group or a crash rise: a MaxAgents event, so an agent picks it up.
- Mark a group resolved; it reopens on a new report.

## Status

Planned, not built.
