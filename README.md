# quota-pets

[繁體中文](README.zh-TW.md)

A row of chibi characters that sits on top of your Windows desktop. Each one holds a sheet of
paper showing the subscription quota for its model family: Claude, GPT/Codex, Grok and Qwen.
Each character switches pictures when its agent is working, when quota runs out, or when it has
been idle for a while.

![quota-pets](docs/preview.png)

On a real desktop, over Windows Terminal:

![quota-pets on a desktop](docs/screenshot.png)

> **Something not working, or want it changed?** Let your coding agent do it. The repo ships an
> [AGENTS.md](AGENTS.md) that tells an agent how to set up a data backend and how to change
> characters, poses, rules and layout.

## Install

1. Download `quota-pets-win-x64.zip` from Releases and unzip it anywhere.
2. Run `QuotaPets.exe`. It does not show in the taskbar; it has a tray icon.
3. The exe is not code-signed, so Windows SmartScreen may warn on first run ("More info" → "Run anyway").

On first run the bundled `pets` folder is copied to `%APPDATA%\額度小人\pets`. Edit images and
settings there; the right-click menu item "開啟角色資料夾" opens it. Saved changes reload within
about 0.3 s.

## Data source

`server` in `pets/config.json`:

- `"demo"` (default): no network; cycles through calm / busy / empty / idle every 15 s.
- A base URL such as `"http://localhost:10026"`: reads `/api/quota` every 60 s and
  `/api/agents` every 20 s. The JSON format is in [docs/API.md](docs/API.md); a small
  server in any language can provide it. `tools/example_server.py` is a starting point.

## Using it

| Action | Effect |
|---|---|
| Click a character | It says a line; an idle one wakes up for 10 s and shows quota |
| Drag a character | Moves the whole row; snaps to top-center or top-left within 48 px |
| Transparent pixels | Clicks pass through to the window behind |
| Ctrl + mouse wheel on a character | Zoom the whole row in 5 % steps; menu "大小" has 50–150 % presets |
| Right-click (character or tray) | Adjust, lock, size, window binding, refresh, reload, open folder, start at login, quit |

### Show only with chosen windows (optional)

Focus a window (for example one terminal) and press **Ctrl+Alt+B** to bind or unbind it. With at
least one binding, the row appears only while a bound window is in front and hides about 0.2 s after
you switch away or minimize it. The menu "綁定視窗" lists every open window and every program, and
has a mode that shows the row while any bound window is open. Single windows are matched by handle,
so a binding ends when that window closes. Tabs inside one Windows Terminal window share a handle.

### Adjust mode (right-click → "調整位置…")

Click a part or press Tab to cycle: each character's image and text box, then the ledge and the
whole row. Arrow keys move 1 px (Shift: 10 px). Alt + arrows resize. `+`/`-` font size, `[`/`]`
rotate, `P` previews the next pose so every picture can be aligned. Enter saves and locks;
Esc discards; Ctrl+S saves and keeps editing.

## Characters

```
pets/
  config.json               server, polling, thresholds, character order, row placement, binding
  characters/<id>/
    character.json          quota rows, poses, rules, text box, lines
    normal.png 01_working.png 02_quota_empty.png 03_idle.png
```

Each pose is one whole picture. `character.json` maps pose names to pictures and lists rules,
checked top to bottom; the first rule that matches picks the pose. Default rules:

1. Data server unreachable → `offline`
2. Agent not working and idle ≥ 30 min, not clicked in the last 10 s → `idle` (no quota shown)
3. Any row ≥ 90 % used → `critical`
4. Agent working → `working`
5. Any row ≥ 75 % used → `warning`
6. Otherwise → `normal`

Rule conditions: `source`, `agentState`, `idleSecAtLeast`, `severity`, `leftBelow`,
`clickedWithinSec`, `hours`, `not`, `any`. New conditions are one function each in
`app/renderer/js/rules.js`. Pictures can be png, gif, webp, apng, webm or mp4. The full field
reference is in [README.zh-TW.md](README.zh-TW.md).

## Development

- `npm install && npm start` runs it with Electron on Linux/macOS/Windows (window binding is Windows only).
- `tools/package_win.sh` builds `dist/quota-pets-win-x64.zip` from the official Electron Windows build.
- Browser preview with fake data: serve `app/` over http and open `renderer/index.html`
  (`?state=warning|critical|sleep`, `?edit=1`).

## License

- Code: MIT ([LICENSE](LICENSE)).
- Character art (`app/pets/characters/**/*.png`): CC BY-NC 4.0 ([ART-LICENSE.md](ART-LICENSE.md)).
- Not affiliated with Anthropic, OpenAI, xAI or Alibaba.
