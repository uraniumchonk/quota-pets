# AGENTS.md

Guide for coding agents working on quota-pets. Read this before changing anything. The user
facing docs are `README.md` (English) and `README.zh-TW.md` (full field reference, Chinese).

## What it is

An Electron app for Windows: one transparent, frameless, always-on-top window at the top of the
screen holding a row of characters. Each character picture contains a blank sheet of paper; the
app writes quota numbers onto that paper. Data comes from an HTTP server (`server` in
`pets/config.json`) or from the built-in demo (`"server": "demo"`).

## Repo map

| Path | Role |
|---|---|
| `app/main.cjs` | Main process: window, tray and right-click menu, drag and snap, polling the data server, demo data, loading and saving the pets folder, upgrade carry-over, window binding glue, zoom menu |
| `app/winbind.cjs` | Window binding. Spawns a hidden PowerShell that hooks Windows events (foreground, minimize) through C# `Add-Type` and prints JSON lines |
| `app/preload.cjs` | IPC bridge exposed as `window.host` |
| `app/i18n.json` | Interface strings per language (`zh-TW`, `en`); main passes the chosen set to the renderer as `cfg.strings` |
| `app/renderer/js/quota.js` | Turns the API payload into one context object per character (rows, severity, agent state, idle seconds) |
| `app/renderer/js/rules.js` | Rule conditions (`QP.conditions`) and pose resolution |
| `app/renderer/js/view.js` | Layout and drawing: frames, sign text, bubbles |
| `app/renderer/js/editor.js` | Adjust mode (arrow-key nudging, save, lock) |
| `app/renderer/js/app.js` | Boot, repaint loop, alpha-mask hit testing, click / drag / wheel, chatter |
| `app/renderer/js/mock-host.js` | Fake `window.host` for browser preview |
| `app/pets/` | Bundled characters and config, copied to `%APPDATA%\額度小人\pets` on first run |
| `docs/API.md` | The data server contract |
| `tools/example_server.py` | Minimal data server (standard library) |
| `tools/package_win.sh` | Builds `dist/quota-pets-win-x64.zip` from the official Electron Windows zip |

## Setting up a data backend

1. Read `docs/API.md`. Two GET endpoints: `/api/quota` and `/api/agents` (optional).
2. Start from `tools/example_server.py`. Replace `load()` with real readings: each provider's
   official usage or billing endpoint, or numbers the user enters.
3. Keys must line up with the characters: `quota.<provider>` matches `quota[].provider` in a
   `character.json`, `windows[].id` matches `quota[].window`, `agents[].id` matches `agent`.
4. Set `server` in the user's `%APPDATA%\額度小人\pets\config.json`. The app reloads on save.
5. Keep credentials on the server side. The app only reads the JSON.

## Units and layout

- `textBox`, `ledge.y/height/overhang` and `size` are in image pixels of the character picture.
- `offset`, `gap`, `shiftY` are in screen pixels at 100 % zoom.
- Layout multiplies image pixels by `rail.scale * character.scale * rail.zoom` and screen pixels
  by `rail.zoom`, then sets real pixel sizes. Do not reintroduce CSS `transform: scale()` on the
  rail or frames: animated layers keep their first raster scale and turn blurry after zooming.
- The window sits at the top edge; negative `shiftY` or `offset.y` pushes heads off screen.

## Changing behaviour

- New pose: add the picture, add `poses.<name>` in `character.json`, add a rule. A pose whose
  paper sits elsewhere gets its own `textBox`.
- New rule condition: one function in `QP.conditions` (`rules.js`), `(value, ctx) => boolean`.
  Add any new context field in `quota.js` (`QP.buildContext`) or `App.ctxOf` (`app.js`).
- New character: new folder under `app/pets/characters/`, add its id to `characters` in
  `config.json`.
- Changing bundled `pets/` content: raise `bundleVersion` in `app/pets/config.json`. On start the
  app moves the user's old folder to `pets.bak-<time>`, installs the new bundle and carries over
  the user's placement, zoom, binding, server and per-character offsets and text boxes
  (`carryOver` in `main.cjs`). Extend `carryOver` when you add a user-tunable field.
- PowerShell C# code in `winbind.cjs` must compile as C# 5 (Windows PowerShell 5.1): no string
  interpolation, no `?.`, no `out var`.

## Text and languages

- Interface text goes through `t(key, vars)` in `main.cjs` and `QP.t(key, vars)` in the renderer, with
  keys in `app/i18n.json`. Add every new string to all languages there; do not hard-code UI text.
- Character content (`name`, `quota[].label`, `lines`, pose `text`) may be a string or
  `{ "zh-TW": ..., "en": ... }`; read it through `QP.loc()`. `QP.loc()` treats an object as
  per-language only when every key is a language code, so call it on the leaf value (for `lines`,
  on `lines.<pose>`), not on a map keyed by pose names.

## Checking your work

- Syntax: `node --check` on each `.cjs` / `.js` file.
- Browser preview with fake data: `cd app && python3 -m http.server 18777`, open
  `http://127.0.0.1:18777/renderer/index.html` (`?state=warning|critical|sleep`, `?edit=1`, `?lang=en`).
  Force poses from the console: `QP.app.forcePose = {0: 'working'}; QP.app.tick()`.
- Real Electron on Linux without a display: `npm install`, then
  `xvfb-run -a node_modules/.bin/electron --no-sandbox --user-data-dir=/tmp/qp app`.
  Use a throwaway `--user-data-dir` so the real pets folder is untouched.
- Window binding only runs on Windows; test it there.
- Package: `tools/package_win.sh`.
