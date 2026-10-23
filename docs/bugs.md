# Bugs

Known problems in the code, most severe first; none fixed yet.

## Open

| Severity | Where | Problem | Effect |
|---|---|---|---|
| High | `src/ios.yml`, `src/android.yml` | Signing secrets are job-level `env`, so `npm ci` / `npm install` sees them | Any dependency's install script can steal the certificate, profile or keystore with its password |
| Medium | `src/ios.yml`, `src/android.yml` | Capacitor packages install unpinned (latest) | A new Capacitor major can break builds or mismatch the web app's plugin versions |
| Medium | `src/android.yml` | `setup-node` uses `cache: npm` | Fails without `package-lock.json`, so yarn, pnpm or lockless projects can't build Android |
| Medium | `src/ios.yml`, `src/android.yml` | No place for native config: Android deletes `android/` every build; iOS keeps only a committed `ios/` | Plugins needing permissions or `Info.plist` usage texts (camera, location) can't be configured |
| Medium | `src/ios.yml` | A committed `ios/` skips `cap add`; the bundle ID and name aren't updated from `APP_ID` / `APP_NAME` | Dev and production with different IDs build with the wrong ID; signing fails |
| Medium | `src/ios.yml`, `src/android.yml` | Capacitor config sets no `server.errorPath` | The bundled offline page is never shown |
| Medium | `src/android_keygen.yml` | The keystore Base64 is a workflow artifact for 24 h | In public repos any signed-in GitHub user can download it; only the password protects it |
| Low | `src/android.yml` | `server.cleartext` is always `true`; iOS only for `http:` URLs | Android allows plain HTTP traffic even for an HTTPS server |
| Low | `scripts/install.js` | Setup runs only as npm `postinstall`; no command to run it by hand | pnpm 10+ and Bun skip it, so no workflows are added and nothing says so |
| Low | `src/android_keygen.yml` | Input `cn` is pasted into the shell script unquoted | A `"` or `,` in the name breaks keygen; shell code in it runs (needs write access) |
| Low | `src/ios.yml`, `src/android.yml` | `permissions: contents: write` is unused | The workflow token has more rights than needed |
| Low | `src/ios.yml`, `src/android.yml` | A failing `npm ci` falls back to `npm install` | Lockfile errors are hidden; builds may use other dependency versions |
| Low | `src/android.yml` | Preflight doesn't require `APP_NAME`; defaults to `App` | A missing name ships silently as "App" on Android but fails on iOS |
| Low | `package.json` | README is `.github/README.md`; npm only reads a root README | The npm page has no README |

## Status

None fixed.
