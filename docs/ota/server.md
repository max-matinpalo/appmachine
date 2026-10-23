# OTA server

Node API (MaxServer on Bun) that stores releases, answers update checks and serves the app files and the Admin GUI.

## Code

- `server/` in this repo, not part of the npm package.
- MaxServer project: routes in `server/src/`, Admin GUI in `server/gui/` (Vite and Preact, built to `server/gui/dist/`).
- Tests: `bun test` in `server/`.

## Config

Environment variables; `.env` in development.

| Name | Example | Purpose |
|---|---|---|
| `PORT` | `3700` | Port on 127.0.0.1 |
| `DOMAIN` | `maxapp.dev` | Admin host; app hosts are `<APP_ID>.<DOMAIN>` and `<APP_ID>-beta.<DOMAIN>` |
| `DATA` | `/var/lib/maxapp` | Data folder |
| `APP_ID` | `tf` | The one app for now |
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

- A report replaces the device's earlier state for that release.

## Releases

- Manifest: JSON text `{"files":{"<path>":"<sha256 hex>"}}`; paths relative, `/`-separated, sorted.
- Signature: base64 of the ECDSA P-256 SHA-256 signature (WebCrypto format, 64 bytes `r‖s`) of the manifest's UTF-8 bytes.
- Rollout: a device is in when the first 8 hex digits of `sha256(device + id)`, as a number, `% 100 < rollout`.
- Release for a device: its channel's releases with its key, not `rolledback`, newest first; the first one that is the device's `current`, or `live` with the device in its rollout. None: no update.
- First visit: the newest `live` release of the channel with key `web` and rollout 100.

## App routes

| Route | Result |
|---|---|
| `GET /_ota/check?device=&current=&key=` | 200 `{ id, manifest, signature }` of the device's release, or 204; `Cache-Control: no-store` |
| `GET /_ota/files/<sha256>[.<ext>]` | The file; type from `ext`; `Cache-Control: public, max-age=31536000, immutable`; 404 if missing |
| `POST /_ota/report` `{ device, reports: [{ release, state }] }` | 204; unknown releases are ignored |
| `GET /*` | The first-visit release's file for the path |

- `GET /*`: `/` and folders serve their `index.html`; a path not in the manifest whose last segment has no `.` serves `index.html` (SPA); otherwise 404; no release: 404.
- `GET /*` sends `Cache-Control: public, max-age=60, stale-if-error=86400` and the type from the path's extension.

## Admin routes

| Route | Result |
|---|---|
| `GET /api/app` | `{ id, name }` |
| `GET /api/releases` | All releases, newest first: `{ id, channel, key, commit, created, rollout, state, downloaded, active, failed }`; counts from `reports` |
| `POST /api/files/missing` `{ hashes }` | `{ missing }`: the hashes not stored |
| `PUT /api/files/<sha256>`, raw body | 204; 400 if the body's hash differs |
| `POST /api/releases` `{ channel, key, manifest, signature, commit, rollout? }` | 201 `{ id }`; 400 if the signature fails with `APP_PUBLIC_KEY` or a file is missing; `rollout` defaults to 100, `state` is `live` |
| `PATCH /api/releases/<id>` `{ rollout?, state? }` | The updated release, shaped as in the list |
| `GET /*` | Admin GUI from `server/gui/dist/`; unknown paths serve `index.html` |

- `channel`: `production` or `beta`.
- Request bodies up to 100 MB, Cloudflare's limit.

## Status

Not implemented.
