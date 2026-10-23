# Updater

Shared updater JS and the PWA service worker: check, download, verify, trial, rollback and reporting.

## Files

`npx appmachine publish` adds both to every bundle:

| Bundle file | Source | Role |
|---|---|---|
| `appmachine.js` | `ota/client.js`, `ota/native.js` | Updater: PWA and [apps](native.md#updater); classic script, inserted first in `index.html`'s `<head>` |
| `appmachine-sw.js` | `ota/sw.js` | PWA service worker, scope `/` |

- Publish prepends `const APPMACHINE = { key, publicKey }` to `appmachine.js`: the [compatibility key](native.md#compatibility-key) and the public JWK.
- `client.js` does nothing in an app; `native.js` nothing in a browser.
- Both define no other globals.

## State

| Where | Content |
|---|---|
| Cache `appmachine`, `/appmachine/state` | JSON state, see below |
| Cache `appmachine`, `/appmachine/release/<id>` | The release's manifest text |
| Cache `appmachine-files`, `/_ota/files/<sha256><ext>` | Files; `ext` from the path, e.g. `.js` |

| State field | Meaning |
|---|---|
| `device` | Random UUID |
| `kept` | Release that started successfully, or null |
| `trial` | Downloaded and verified release, not yet started successfully, or null |
| `tries` | Launches of `trial` so far |
| `bad` | Releases that failed on this device |
| `reports` | Queued `{ release, state }` reports |

## Updater

1. Registers `/appmachine-sw.js` and asks `navigator.storage.persist()`.
2. Ready: 2 s after `load` without an uncaught script error (`error` event on `window`).
3. On ready with a running trial (`trial` and `tries > 0`): `kept = trial`, `trial = null`, `tries = 0`, queue `active`, delete files and manifests not in `kept`.
4. 2 s after `load`, always: send queued reports to `/_ota/report`, then check `/_ota/check` with `device`, `current` (`trial`, else `kept`), key `web` and the device specs ([server](server.md#app-routes)).
5. Check result 204, `trial` or a `bad` release: nothing.
6. Check result `kept`: drop a pending `trial` (rollback before it started).
7. New release: verify the signature, download missing files and verify each hash, store the manifest; then `trial = id`, `tries = 0`, queue `downloaded`.
8. Any failure stops quietly; the next launch tries again.

## Service worker

- `skipWaiting` on install, `clients.claim` on activate.
- Handles same-origin GETs except `/_ota/`; everything else goes to the network.
- A navigation is a launch: it reloads the state; with a `trial`, `tries + 1`; over 2: queue `failed`, add it to `bad`, `trial = null`.
- Serves `trial` when `tries > 0`, else `kept`; neither: network.
- Paths: `/` and folders serve their `index.html`; navigations not in the manifest serve `index.html`; other requests not in the manifest go to the network.
- Responds with a new `Response` (cached body and `Content-Type`), so the page keeps the request URL.
- A file missing from the cache: network.

## Status

Implemented.
