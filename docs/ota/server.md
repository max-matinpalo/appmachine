# OTA server

Node API (MaxServer on Bun) that stores releases, answers update checks and serves the app files and the Admin GUI.

## Code

- `server/` in this repo, not part of the npm package.
- MaxServer project: routes in `server/src/`, Admin GUI in `server/gui/` (Vite and Preact, built to `server/gui/dist/`).
- Tests: `bun test` in `server/`; end to end with updater, publish and GUI: `node --test --test-reporter=spec test/ota/e2e.test.js` from the repo root.

## Config

Environment variables; `.env` in development.

| Name | Example | Purpose |
|---|---|---|
| `PORT` | `3700` | Port on 127.0.0.1 |
| `DOMAIN` | `maxapp.dev` | Admin host; app hosts are `<APP_ID>.<DOMAIN>` and `<APP_ID>-beta.<DOMAIN>` |
| `DATA` | `/var/lib/maxapp` | Data folder |
| `APP_ID` | `tf` | The server's one app; another app runs its own server |
| `APP_NAME` | `TeamFeedback` | Shown in the GUI |
| `APP_PUBLIC_KEY` | `{"kty":"EC",...}` | Public JWK of the app's signing key |
| `NODE_ENV` | `production` | Otherwise development: no Access check, API docs at `/docs` |

- Local: `DOMAIN=localhost`; `http://localhost:3700` is the admin host, `http://tf.localhost:3700` the app.

## Hosts

The request's host, without port, picks the role:

| Host | Role |
|---|---|
| `<DOMAIN>` | Admin: GUI and `/api/` |
| `<APP_ID>.<DOMAIN>` | App, channel `production` |
| `<APP_ID>-beta.<DOMAIN>` | App, channel `beta` |
| Other | 404 |

- Admin routes on app hosts and app routes on the admin host: 404.
- In production, admin requests without the `Cf-Access-Jwt-Assertion` header get 403. Access does the authentication; the check only fails closed if the Access app is missing.

## Storage

- `DATA/files/<sha256>`: file contents by hash, written once.
- `DATA/ota.db`: SQLite (`bun:sqlite`).

| Table | Columns |
|---|---|
| `releases` | `id` integer primary key, `channel`, `key`, `manifest`, `signature`, `commit`, `created` (ms), `rollout` (0–100), `state` (`live`, `paused`, `rolledback`) |
| `reports` | `release`, `device`, `state` (`downloaded`, `active`, `failed`), `time` (ms); primary key `release, device` |
| `devices` | `id` primary key, `channel`, `running`, `staged`, `first`, `last` (ms), `agent` (User-Agent), `country` (`Cf-IPCountry`), `screen`, `standalone`, `installed`, `language`, `cores`, `memory`, `model`, `platform` |

- A report replaces the device's earlier state for that release.
- Each check upserts the device: `running` from the check, `staged` = the release the check returns if it differs from `running`. `installed` stays 1 once a launch was `standalone`.

## Releases

- Manifest: JSON text `{"files":{"<path>":"<sha256 hex>"}}`; paths relative, `/`-separated, sorted.
- Signature: base64 of the ECDSA P-256 SHA-256 signature (WebCrypto format, 64 bytes `r‖s`) of the manifest's UTF-8 bytes.
- Rollout: a device is in when the first 8 hex digits of `sha256(device + id)`, as a number, `% 100 < rollout`.
- Release for a device: its channel's releases with its key (key `web`: every key), not `rolledback`, newest first; the first one that is the device's `current`, or `live` with the device in its rollout. None: no update.
- First visit: the newest `live` release of the channel with rollout 100, any key.

## App routes

| Route | Result |
|---|---|
| `GET /_ota/check?device=&current=&key=` + specs | 200 `{ id, manifest, signature }` of the device's release, or 204; records the device; `Cache-Control: no-store` |
| `GET /_ota/files/<sha256>[.<ext>]` | The file; type from `ext`; `Cache-Control: public, max-age=31536000, immutable`; 404 if missing |
| `POST /_ota/report` `{ device, reports: [{ release, state }] }`, as JSON or `text/plain` JSON text | 204; unknown releases are ignored |
| `GET /*` | The first-visit release's file for the path |

- `/_ota/` responses send `Access-Control-Allow-Origin: *` for the apps (`https://localhost`, `capacitor://localhost`); updaters send reports as `text/plain`, so no preflight.
- Check specs, all optional: `running` (release ID this launch runs from cache, empty from network), `screen` (`390x844@3`), `standalone` (`0`/`1`), `language`, `cores`, `memory` (GB), `model`, `platform` (client hints). Unknown fields are dropped, so newer apps can send more.
- `GET /*`: `/` and folders serve their `index.html`; a path not in the manifest whose last segment has no `.` serves `index.html` (SPA); otherwise 404; no release: 404.
- `GET /*` sends `Cache-Control: public, max-age=60, stale-if-error=86400` and the type from the path's extension.

## Admin routes

| Route | Result |
|---|---|
| `GET /api/app` | `{ id, name }` |
| `GET /api/devices` | All devices, last seen first: the `devices` columns, with `device`, `system` and `browser` named from `agent`, `model` and `platform`; `staged` is null if the device reported it failed |
| `GET /api/releases` | All releases, newest first: `{ id, channel, key, commit, created, rollout, state, downloaded, active, failed }`; counts from `reports` |
| `POST /api/files/missing` `{ hashes }` | `{ missing }`: the hashes not stored |
| `PUT /api/files/<sha256>`, raw body (`application/octet-stream`) | 204; 400 if the body's hash differs |
| `POST /api/releases` `{ channel, key, manifest, signature, commit, rollout? }` | 201 `{ id }`; 400 if the signature fails with `APP_PUBLIC_KEY` or a file is missing; `rollout` defaults to 100, `state` is `live` |
| `PATCH /api/releases/<id>` `{ rollout?, state? }` | The updated release, shaped as in the list |
| `GET /*` | Admin GUI from `server/gui/dist/`; unknown paths serve `index.html` |

- `channel`: `production` or `beta`.
- Request bodies up to 100 MB, Cloudflare's limit.

## Deploy

- Runs on hp83: service `maxapp` (user `maxapp`, code in `/opt/maxapp`, data in `/var/lib/maxapp`).
- Cloudflare Tunnel `maxapp-hp83`, service `cloudflared`: `maxapp.dev` and `*.maxapp.dev` to `127.0.0.1:3700`.
- Machine setup, once: `server/deploy/setup.sh` as root with `MAXAPP_TUNNEL_TOKEN` (MaxAgents secret).
- Deploy: `server/deploy/deploy.sh` in the main copy; config in `server/deploy/app.env`.
- The app is TeamFeedback (`tf`); its private key: MaxAgents secret `TF_OTA_PRIVATE_KEY`.
- Publish's Access service token `maxapp-publish` (policy `maxapp-publish` on `MaxApp`): MaxAgents secrets `MAXAPP_PUBLISH_CLIENT_ID` and `MAXAPP_PUBLISH_CLIENT_SECRET`.
- Moving to another machine: copy `/var/lib/maxapp`, run both scripts there, stop the services here.

## Status

Implemented.
