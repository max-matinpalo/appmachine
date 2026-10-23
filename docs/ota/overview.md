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
- Store review: must pass Apple App Store and Google Play review; see [Store review](#store-review).

## Principles

- Minimal: as few lines as possible; Swift and Kotlin code as small as possible, ideally none.
- Own updater, mostly JS; the Capgo and Capawesome updater plugins are references only, not used.
- Apps run from bundled local files, not from `APP_SERVER_URL`.
- One mechanism: iOS, Android and PWA share bundles, server API, channels and updater JS; see [PWA](#pwa).
- Server: Node.js (MaxServer).
- Our server serves the bundles; Cloudflare's CDN cache absorbs download load; no object storage.

## Store review

Hard requirement: comply with every written store rule. Apple decides, so approval can't be guaranteed.

| Rule | Requirement |
|---|---|
| Apple license agreement 3.3.1(B) | OTA ships only JS, HTML, CSS and assets run by WebKit; it keeps the app's purpose and never bypasses signing or sandbox |
| Guideline 2.5.2 | OTA never introduces or changes features; new features go through a store build |
| Guidelines 2.3.1, 2.5.19 | Every feature is in the reviewed build and in review notes; no hidden or dormant features switched on later |
| Guideline 4.2 | The bundled version is a complete, app-like app on its own, not a website wrapper |
| Guideline 2.5.2 (container) | The updater only uses Capacitor's public `WebView` calls and files inside the app container |
| Google Play Device and Network Abuse | JS updates in a WebView are allowed; native code updates are not |

- OTA may ship: bug fixes, content, text, styling and small changes within reviewed features.
- Store build needed: native code or plugins, permissions, new features, anything review requires.

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

## Activation and rollback

- No native code; the updater uses only the `WebView` calls above.
- At launch, a downloaded bundle starts as a trial with `setServerBasePath`.
- It is kept with `persistServerBasePath` only after it reports ready.
- Crash or hang before ready: the next launch opens the last kept bundle and marks the trial bad.
- The kept path always points to a bundle that has started successfully.
- Cost: one extra reload, behind the splash screen, on the first launch of each update.

## Compatibility

- Each native build has a compatibility key: a hash of the Capacitor and native plugin versions.
- The server sends a device only bundles with its key.

## Signing

- ECDSA P-256 with the WebView's built-in WebCrypto; no library.
- The public key ships in the app; the private key stays with the publisher.

## Bundles

- A bundle is a signed file list plus its files, stored by content hash.
- Devices download only changed files; interrupted downloads resume; no unzip.

## Delivery

- Bundle files have immutable hash URLs: `Cache-Control: public, max-age=31536000, immutable`.
- A Cloudflare cache rule caches them; by default Cloudflare skips files without known extensions.
- Update checks are never cached.
- Server down: update checks fail and the app keeps its current bundle.
- Back up the server's data folder: bundles and release database.

## PWA

Only storage and serving differ per platform; check, download, verify, trial, rollback and reporting are shared.

| | iOS and Android | PWA |
|---|---|---|
| Bundle files | Filesystem, inside the app container | Cache Storage |
| Serves the active bundle | Capacitor `WebView` base path | Service worker |
| Compatibility key | Native build hash | `web` |

## Status

Spec only; nothing is implemented. The build workflows still load the app from `APP_SERVER_URL`.
