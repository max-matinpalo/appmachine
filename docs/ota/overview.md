# OTA updates

Main spec for AppMachine's own over-the-air web updates of Capacitor iOS and Android apps.

## Goals

- Bundled app: each store build ships a complete working web bundle and the updater.
- Offline: the app starts without internet; local features and saved data stay available; login and sync need internet.
- Updates: signed web bundles download in the background and activate safely on next launch.
- Compatibility: a device gets only bundles compatible with its installed native build.
- Recovery: interrupted or failed updates keep a working version and user data; a failed startup rolls back automatically.
- Controls: multiple apps, beta and production channels, gradual rollout, pause, rollback, status reporting.
- Ownership: our own API, storage and publishing tools; no vendor cloud.
- Store rules: native changes and changes that need review go through the stores; approval can't be guaranteed.

## Principles

- Minimal: as few lines as possible; Swift and Kotlin code as small as possible, ideally none.
- Own updater, mostly JS; the Capgo and Capawesome updater plugins are references only, not used.
- Apps run from bundled local files, not from `APP_SERVER_URL`.
- Server: Node.js (MaxServer).
- Our server serves the bundles; Cloudflare's CDN cache absorbs download load; no object storage.

## Capacitor base

Capacitor's built-in `WebView` plugin (verified in Capacitor's source):

| Call | Effect |
|---|---|
| `setServerBasePath({ path })` | Serves web files from `path` and reloads now |
| `persistServerBasePath()` | Keeps the current path for later launches |
| `getServerBasePath()` | Returns the current path |

- A new store build (changed version code or name) clears the kept path; the app starts with its bundled files.
- iOS reopens a kept path as `Library/NoCloud/ionic_built_snapshots/<folder name>`, so bundles live there.
- iOS doesn't check that the kept folder exists; Android falls back to the bundled files.

## Status

Spec only; nothing is implemented. The build workflows still load the app from `APP_SERVER_URL`.
