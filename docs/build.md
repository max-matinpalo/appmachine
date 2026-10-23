# Build Pipeline

Steps and config shared by the iOS and Android build workflows.

## Triggers

| Tag | Platform | GitHub environment |
|---|---|---|
| `iosdev` | iOS | `Development` |
| `ios` | iOS | `Production` |
| `androiddev` | Android | `Development` |
| `android` | Android | `Production` |

- Start a build: `git tag -f android && git push -f origin android` on the branch to build.
- Dev and production builds differ only in their environment's variables and secrets.
- The result is a workflow artifact to download.

## Config

GitHub environment variables used by both platforms:

| Name | Required | Description | Example |
|---|---|---|---|
| `APP_SERVER_URL` | Yes | URL the app loads | `https://app.example.com` |
| `APP_ID` | Yes | iOS Bundle ID / Android package name | `com.company.app` |
| `APP_NAME` | iOS yes, Android no (default `App`) | Visible app name | `ExampleApp` |
| `APP_VERSION` | No | Marketing version; kept from the native project if unset | `1.2.0` |

- Platform secrets: [ios.md](ios.md#config), [android.md](android.md#config).
- A preflight step fails the build when a required value is missing.

## Steps

1. Install the project's dependencies (`npm ci`, else `npm install`).
2. Install the latest Capacitor packages without saving them.
3. Copy `appmachine/www/` to `www/` and write `capacitor.config.json`.
4. Create the native project and generate icons and splash.
5. Sync, configure signing, set versions, build, upload the artifact.

## Capacitor config

| Field | Value |
|---|---|
| `appId` | `APP_ID` |
| `appName` | `APP_NAME` |
| `webDir` | `www` (the offline page) |
| `server.url` | `APP_SERVER_URL` without trailing slash; invalid URL fails the build |
| `server.allowNavigation` | The URL's host and its subdomains |
| `server.cleartext` | iOS: only for `http:` URLs; Android: always |

- Existing `capacitor.config.*` files are deleted first.

## Icons and splash

- Source: `appmachine/icon.png`; dev tags use `appmachine/icon.dev.png` when it exists.
- `@capacitor/assets` makes the icon, dark icon, splash and dark splash from it.
- No icon: assets are skipped with a warning.

## Versions

- Build number (iOS `CFBundleVersion`, Android `versionCode`) is the workflow run number.
- Marketing version (iOS `CFBundleShortVersionString`, Android `versionName`) is `APP_VERSION` when set.

## Status

- The offline page isn't shown on load errors: the config sets no `server.errorPath`; more in [bugs.md](bugs.md).
- Planned: apps run from bundled web files with OTA updates instead of `server.url`: [ota/overview.md](ota/overview.md).
