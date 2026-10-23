# OTA updates

Main spec for AppMachine's own over-the-air web updates of Capacitor iOS and Android apps.

## Goals

- Bundled app: each store build ships a complete working web bundle and the updater.
- Offline: the app starts without internet; local features and saved data stay available; login and sync need internet.
- Updates: signed web bundles download in the background and activate safely on next launch.
- Compatibility: a device gets only bundles compatible with its installed native build.
- Recovery: interrupted or failed updates keep a working version and user data; a failed startup rolls back automatically.
- Controls: one app per server, beta and production channels, gradual rollout, pause, rollback, status reporting.
- Ownership: our own API, storage and publishing tools; no vendor cloud.
- Store review: must pass Apple App Store and Google Play review; see [Store review](#store-review).

## Principles

- Minimal: as few lines as possible; Swift and Kotlin code as small as possible, ideally none.
- Own updater, mostly JS; the Capgo and Capawesome updater plugins are references only, not used.
- Apps run from bundled local files, not from `APP_SERVER_URL`.
- Offline data and features use web APIs (IndexedDB, Cache Storage), the same on all platforms.
- One mechanism: iOS, Android, PWA and later desktop (Tauri) share bundles, server API, channels and updater JS; see [PWA](#pwa).
- Server: Node.js (MaxServer): [server.md](server.md).
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

- No native code; the updater uses only the `WebView` calls above; PWA: [updater.md](updater.md).
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
- File URLs end with the path's extension, e.g. `.js`, so the server knows the type.
- A Cloudflare page rule, Cache Everything on `*.maxapp.dev/*`, caches app hosts as the server's `Cache-Control` says; `maxapp.dev` is not cached.
- Browser Cache TTL is "respect existing headers", so browsers follow the server too.
- Update checks are never cached.
- `index.html`, service worker and web manifest: short cache with `stale-if-error`, so first visits work while the server is down.
- Cloudflare Tiered Cache on (free): fewer requests reach our server.
- The server runs behind a Cloudflare Tunnel; no public IP needed.
- Server down: update checks fail and the app keeps its current bundle.
- Back up the server's data folder: bundles and release database.

## Domains

| Host | Serves | Access |
|---|---|---|
| `maxapp.dev` | Admin GUI, publish API | Private: Access app `MaxApp`, policies `max`, `agents` and `maxapp-publish` |
| `<app>.maxapp.dev`, e.g. `tf.maxapp.dev` | The app's PWA (production), update checks, bundle files | Public |
| `<app>-beta.maxapp.dev` | The app's beta PWA | Public |

- Each app has its own origin, so PWA storage and service workers stay separate.
- Beta uses `-beta`, not `beta.<app>`: Cloudflare's free certificate covers only one subdomain level.
- A wildcard `*.maxapp.dev` goes through the tunnel; a new app needs no DNS change.
- The Access app lists only `maxapp.dev`, not `*.maxapp.dev`, so app hosts stay public.

## Controls

- One app, one server, one config: the app's ID, name, signing key and channels `production` and `beta`; another app runs its own server.
- An app's ID is its subdomain, e.g. `tf`.
- Channel comes from the build: Development builds `beta`, Production builds `production`; a PWA by domain, see [Domains](#domains).
- A device gets the newest active release of its channel with its compatibility key.
- Rollout: a percentage per release; a device is in when `hash(deviceId + releaseId) % 100 < rollout`, so raising it only adds devices.
- Pause: devices without the release stop getting it; devices with it keep it.
- Rollback: the server offers the previous release again; devices switch on next launch.
- Status: each device reports downloaded, active or failed per release, queued while offline.
- The device ID is a random UUID; no personal data.

## Publishing

- `npx appmachine publish [--channel beta] [--rollout <0–100>] [--dir dist]` runs `npm run build --if-present`, then publishes `--dir`.
- It adds the [updater files](updater.md#files), signs the file list, uploads new files and creates the release with its compatibility key (`web` for now) and git commit (`GITHUB_SHA`, else `git rev-parse HEAD`).
- `--channel` defaults to `production`, `--rollout` to 100.
- Environment: `OTA_PRIVATE_KEY` (private JWK), `MAXAPP_URL` (default `https://maxapp.dev`), and `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` of the Access service token `maxapp-publish`; the server has no auth code.
- `npx appmachine keygen` prints a new key pair: `OTA_PRIVATE_KEY` and `APP_PUBLIC_KEY`.
- Tags `web` (production) and `webdev` (beta) run `publish` on GitHub Actions: `src/web.yml`.
- Each store build also publishes its bundled version as a release.
- Controls and status: [Admin GUI](#admin-gui).
- Errors and crashes: [errors.md](errors.md) (planned).

## Admin GUI

- Served by the OTA server at `maxapp.dev`; Vite and Preact, in `server/gui/`.
- Behind Cloudflare Access; no own login.
- Inspiration: Ionic Appflow's Deploy screens (builds list, channel with deployment history).
- Shows the server's one app; no app switcher.
- Tabs Production and Beta list their releases, newest first: ID, commit, date, rollout, state, downloaded, active, failed.
- Actions per release: set rollout, pause, resume, rollback.
- Devices (`#devices`): a table of every device, last seen first: model, system, browser, screen, cores and RAM, opened from Home Screen or browser (and installed earlier), country and language, running release (pending one on next launch, Beta badge), last and first seen. Below 1024 px each device is a card.
- Docs (`#docs`): how it works: publish, update flow, channels with the app's domains, controls, devices, status.

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

PWA and Admin GUI implemented and live on `maxapp.dev`, for TeamFeedback (`tf.maxapp.dev`). Not yet:

- iOS and Android; their build workflows still load the app from `APP_SERVER_URL`.
- Backups of the server's data folder.
- TeamFeedback publishing: its app still registers its own service worker, and its repo has no `web` workflow or OTA secrets yet.
- A real run of `src/web.yml`.
