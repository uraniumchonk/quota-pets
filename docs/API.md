# Data API

Set `server` in `pets/config.json` to a base URL. The app calls two endpoints with plain
`GET` and expects JSON. Fields not listed here are ignored. Any language works; the
reference server is the author's private `agentstat` service.

## `GET /api/quota` (every `pollQuotaSec`, default 60 s)

```json
{
  "quota": {
    "claude": {
      "ok": true,
      "windows": [
        { "id": "5h", "used_pct": 32.0, "resets_at": 1792840799, "severity": "normal" },
        { "id": "7d", "used_pct": 99.0, "resets_at": 1793109599, "severity": "critical" }
      ]
    },
    "codex": { "ok": true, "windows": [ { "id": "7d", "used_pct": 16.0, "resets_at": 1793384000 } ] }
  }
}
```

| Field | Meaning |
|---|---|
| `quota.<provider>` | Any key. A character's `quota[].provider` picks it. |
| `ok` | `false` shows the rows as `—`. |
| `windows[].id` | Any string. A character's `quota[].window` picks it (e.g. `5h`, `7d`). |
| `windows[].used_pct` | Percent used, 0–100. `null` shows `—`. |
| `windows[].resets_at` | Unix seconds of the next reset. Optional; shown as a countdown. |
| `windows[].severity` | Optional `normal` / `warning` / `critical`. The app also derives severity from `thresholds` in `config.json` and takes the worse of the two. |

## `GET /api/agents` (every `pollAgentsSec`, default 20 s)

```json
{
  "agents": [
    { "id": "cli:claude", "state": "working", "last_activity_age_sec": 12, "doing": "editing main.cjs" },
    { "id": "cli:codex", "state": "sleeping", "last_activity_age_sec": 5400 }
  ]
}
```

| Field | Meaning |
|---|---|
| `id` | Any string. A character's `agent` picks it. |
| `state` | `working`, `idle`, `sleeping`, `offline` or `unknown`. Rules read it (`agentState`). |
| `last_activity_age_sec` | Seconds since the agent last did something. Rules read it (`idleSecAtLeast`). |
| `doing` | Optional text, shown on the sign of a character without quota rows. |

This endpoint is optional. Without it every agent counts as `unknown`.

## `POST /api/refresh` (optional)

Called by the tray menu item "立即刷新額度" before re-reading `/api/quota`. A 404 is fine.

## Offline

When `/api/quota` fails for 3 polling periods in a row, rules see `source: "offline"` and the
default rules switch every character to the `offline` pose with the last known numbers.
