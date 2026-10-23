# Installer

How `npm install appmachine` sets up a project.

## Install

- Run `npm install appmachine` in the web app's repo.
- npm's `postinstall` runs `scripts/install.js` on every install.
- The project root is `INIT_CWD` (set by npm), else the current folder.
- pnpm 10+ and Bun skip dependency install scripts unless the package is allowed.

## Files written

| Source | Destination | Existing files |
|---|---|---|
| `src/*.yml` | `.github/workflows/` | Overwritten, so workflows follow the package version |
| `template/` | `appmachine/` | Kept, so user changes survive |

## Template

| File | Purpose |
|---|---|
| `www/index.html` | Offline page: "You Are Offline" with a Try Again button that reloads |
| `icon.png` | App icon and splash source, 1024 × 1024 PNG |
| `setup_guide.txt` | Note that the workflows were added |

- Add `appmachine/icon.dev.png` to give dev builds their own icon: [build.md](build.md#icons-and-splash).

## Status

Implemented.
