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
- Offline data and features use web APIs (IndexedDB, Cache Storage), the same on all platforms.
- One mechanism: iOS, Android, PWA and later desktop (Tauri) share bundles, server API, channels and updater JS; see [PWA](#pwa).
- Server: Node.js (MaxServer).
- Our server serves the bundles and the web app; Cloudflare's CDN cache absorbs download load; no object storage.

## Store review

Every store build must pass review; Apple decides, so approval can't be guaranteed.

- Each store build ships the complete current app, not a website wrapper (Apple 4.2).
- OTA ships only JS, HTML, CSS and assets run in the WebView (Apple license 3.3.1(B), Google Play Device and Network Abuse).
- OTA may change anything within the app's reviewed purpose: fixes, UI, new screens, small features.
- Store build needed: native code or plugins, permissions, purpose change, payments, age-rating content.
- Nothing is hidden during review (Apple 2.3.1, 2.5.19).

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
- `index.html`, service worker and web manifest: short cache with `stale-if-error`, so first visits work while the server is down.
- Cloudflare Tiered Cache on (free): fewer requests reach our server.
- The server runs behind a Cloudflare Tunnel; no public IP needed.
- Server down: update checks fail and the app keeps its current bundle.
- Back up the server's data folder: bundles and release database.

## Controls

- Each app has its own ID, signing key and channels `production` and `beta`.
- Channel comes from the build: Development builds `beta`, Production builds `production`; a PWA by domain (`beta.` prefix).
- A device gets the newest active release of its channel with its compatibility key.
- Rollout: a percentage per release; a device is in when `hash(deviceId + releaseId) % 100 < rollout`, so raising it only adds devices.
- Pause: devices without the release stop getting it; devices with it keep it.
- Rollback: the server offers the previous release again; devices switch on next launch.
- Status: each device reports downloaded, active or failed per release, queued while offline.
- The device ID is a random UUID; no personal data.

## Publishing

Commands of the `appmachine` npm package; `--channel` defaults to `production`; one admin token for our server.

| Command | Does |
|---|---|
| `npx appmachine keys` | Creates the app's signing key pair once |
| `npx appmachine publish` | Builds the web app, computes the compatibility key, signs the file list, uploads new files, creates the release with its git commit |

- Tags `web` (production) and `webdev` (beta) run `publish` on GitHub Actions.
- Each store build also publishes its bundled version as a release.
- Controls and status: [Admin GUI](#admin-gui).

## Admin GUI

- Served by the OTA server at `/admin`; plain HTML and JS.
- Behind Cloudflare Access; no own login.
- Inspiration: Ionic Appflow's Deploy screens (builds list, channel with deployment history).
- Shows apps, channels and releases: commit, date, rollout, downloaded, active, failed.
- Actions: set rollout, pause, resume, rollback.

## PWA

The same web app in the browser, optionally installed with its own window and icon; no Capacitor or Tauri. Stays alongside the store and desktop apps, with the same offline support and OTA updates.

1. First visit: our server serves the current production release.
2. The service worker saves its files in Cache Storage; later launches work offline.
3. Install (optional): Chrome or Edge "Install app", Safari "Add to Dock" or "Add to Home Screen".
4. Updates: the shared updater downloads changed files into a new cache; on next launch the service worker serves them as a trial, kept after ready.

Only storage and serving differ per platform; check, download, verify, trial, rollback and reporting are shared.

| | iOS and Android | PWA | Desktop (Tauri, later) |
|---|---|---|---|
| Bundle files | Filesystem, inside the app container | Cache Storage | App data folder |
| Serves the active bundle | Capacitor `WebView` base path | Service worker | Small own Tauri part |
| Compatibility key | Native build hash | `web` | Native build hash |

- One publish updates web, PWA, iOS, Android and desktop.
- PWA first visit needs internet; the store and desktop apps start offline with their bundled version.
- The PWA asks `navigator.storage.persist()`; Safari deletes data of sites not installed after 7 days without use.
- The iOS app can't use a service worker: WebKit allows them only on https sites, and bundled files load from `capacitor://localhost`.

## Status

Spec only; nothing is implemented. The build workflows still load the app from `APP_SERVER_URL`.
