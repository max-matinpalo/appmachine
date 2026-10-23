# AppMachine

npm package that builds signed native iOS and Android apps for a web app with Capacitor on GitHub Actions.

## Goal

- Configure once, push a tag, download a signed app.
- No Xcode, Android Studio or Capacitor on the developer's machine.
- Status: not ready for mainstream use; inspiration for advanced developers.

## How it works

- `npm install appmachine` adds the build workflows and an `appmachine/` folder to the project: [install.md](install.md).
- Pushing a tag starts a build on GitHub Actions: [build.md](build.md).
- The app is a minimal Capacitor shell; rebuild only when native features change.
- Web updates ship over the air: [ota/overview.md](ota/overview.md).

## Parts

| Part | Code | Doc |
|---|---|---|
| Installer | `scripts/install.js`, `template/` | [install.md](install.md) |
| Shared build steps | `src/ios.yml`, `src/android.yml` | [build.md](build.md) |
| iOS build | `src/ios.yml` | [ios.md](ios.md) |
| Android build and keystore | `src/android.yml`, `src/android_keygen.yml` | [android.md](android.md) |
| OTA updates | — | [ota/overview.md](ota/overview.md) |
| Known problems | — | [bugs.md](bugs.md) |

## Native features

- Prefer Web APIs (camera, files) when a solid one exists.
- Otherwise use Capacitor plugins: install them in the web app, e.g. `npm install @capacitor/haptics`.
- The build installs `@capacitor/core`, `cli`, `ios`/`android` and `assets` itself; the web app doesn't need them.

## Roadmap

- Next: own OTA updates, [ota/overview.md](ota/overview.md).
- Later: downloadable macOS app (drag to Applications), lighter than Electron.

## Hosting

- Published to npm as `appmachine`; source at `max-matinpalo/appmachine`.
- Builds run on GitHub-hosted runners in the user's repo: `macos-26` (iOS), `ubuntu-22.04` (Android).

## Status

Implemented, except [OTA updates](ota/overview.md#status). Known problems: [bugs.md](bugs.md).
