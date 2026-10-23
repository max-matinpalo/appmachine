# Native updater

OTA updates in the iOS and Android apps, built by their own `_ota` workflows.

## Workflows

- `src/android.yml` and `src/ios.yml` stay unchanged: apps that load `APP_SERVER_URL`.
- New `src/android_ota.yml` and `src/ios_ota.yml`: apps that run bundled web files and update over the air.
- The installer copies them like the other workflows; a project uses either kind.
- Workflows only call commands; the logic lives in `bin/appmachine.js` and `ota/`.

| Tag | Platform | GitHub environment | Channel |
|---|---|---|---|
| `androiddev-ota` | Android | `Development` | `beta` |
| `android-ota` | Android | `Production` | `production` |
| `iosdev-ota` | iOS | `Development` | `beta` |
| `ios-ota` | iOS | `Production` | `production` |

## Build steps

Same as [build.md](../build.md#steps), except:

1. `npm ci`; Capacitor comes from the project's lockfile, not installed by the workflow.
2. `npx appmachine bundle`: builds the web app, publishes it as a release and writes it with the updater to `www/`.
3. `capacitor.config.json` has no `server.url`: the app starts from `www/`.
4. Secrets: the platform's signing secrets plus `OTA_PRIVATE_KEY`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`.
5. `APP_SERVER_URL` is the app host of the build's channel, e.g. `https://tf-beta.maxapp.dev`.

## Project setup

- The web app lists `@capacitor/core`, `cli`, `android`, `ios` and `filesystem` in `package.json`; its lockfile pins them; the workflow adds only `@capacitor/assets`.
- `@capacitor/filesystem` stores the bundles; `WebView`, built into Capacitor, switches them; no own Swift or Kotlin.

## Compatibility key

- `npx appmachine key`: sha256 of the sorted `name@version` of `@capacitor/core` and every installed package with a `capacitor` field, from `node_modules`.
- Publish and bundle send it as the release's `key`; a project without Capacitor sends `web`.
- A native app checks with its build's key and gets only releases with it.
- A PWA checks with `web` and gets releases of any key: it has no native part.

## Updater

`ota/client.js` gets a native branch when `Capacitor.isNativePlatform()`; check, verify, trial, reports and state stay shared with the [PWA](updater.md).

| | PWA | Native |
|---|---|---|
| Files | Cache Storage | One folder per release, full tree |
| State | Cache `appmachine` | `state.json` via Filesystem |
| Starts a trial | Service worker | `setServerBasePath(<release folder>)` at launch |
| Keeps it | State only | `persistServerBasePath()` on ready |
| Server URLs | Same origin | `APPMACHINE.server` (`APP_SERVER_URL`) |

- Folders: Android `Data/appmachine/<id>/`; iOS `Library/NoCloud/ionic_built_snapshots/<id>/`, where Capacitor looks for kept paths.
- Download: unchanged files are copied from the kept release's folder, the rest fetched and hash-checked, then written.
- Launch: a `trial` that isn't running gets `tries + 1` and starts; over 2 tries: `failed`, added to `bad`.
- Ready (2 s after `load`, no uncaught error) in a trial: keep it, report `active`, delete other release folders.
- A crash before ready reopens the last kept path, so the next launch counts the failed try.
- Bundle writes `APPMACHINE.bundled`, the build's own release ID; a state from another build is reset (device ID kept), since Capacitor drops the kept path on a new store build.
- Rollback to a release without a folder downloads it again.

## Server

- `/_ota/` routes answer CORS (`Access-Control-Allow-Origin: *`, preflight for `POST /_ota/report`): the app's origin is `https://localhost` (Android) or `capacitor://localhost` (iOS).
- Checks and first visits with key `web` match releases of every key; other keys match exactly.

## Status

Implemented. Android tested on the hp2 emulator with a local run of the workflow's steps: offline start, update, rollback, 2-try crash fallback, new store build. Not yet:

- iOS: untested, needs a Mac or a `macos-26` run.
- A GitHub Actions run of the `_ota` workflows.
- A failed release's folder stays until the next kept release.
