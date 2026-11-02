# Backend recipes: where the numbers come from

Notes for agents building a data server for quota-pets (contract: `docs/API.md`). This is how
the author's own backend reads each provider. These are the endpoints the official CLIs call
themselves, not public APIs: they need no extra cost, but they can change without notice. Treat
this as a starting point, check the live response, and adapt.

## Ground rules

- **Read the CLI's credential file, never write it, never refresh the token yourself.** Refresh
  tokens rotate on use. If your server spends one, the official CLI's next refresh fails and the
  user gets logged out. When the access token is expired, skip this round and wait until the CLI
  refreshes it, or run a harmless CLI command that makes the CLI refresh (see Grok).
- Keep tokens on the server. Do not log them and do not put them in the JSON you serve.
- Poll slowly: each provider at most once a minute; every few minutes is plenty. On 429, honour
  `Retry-After` and back off.
- Keep the last good reading when a fetch fails (serve it with its age) instead of an empty card.

## Claude (Claude Code subscription)

| | |
|---|---|
| Credential | `~/.claude/.credentials.json` → `claudeAiOauth.accessToken` (also `expiresAt` in ms, `scopes`, `subscriptionType`) |
| Request | `GET https://api.anthropic.com/api/oauth/usage` |
| Headers | `Authorization: Bearer <accessToken>`, `anthropic-beta: oauth-2025-04-20`, `User-Agent: claude-code/<version>` |

- Needs the `user:profile` scope, which a normal `claude` login has. A `claude setup-token` token
  only has `user:inference` and gets 403.
- The token lives about 8 hours and Claude Code refreshes it while it runs. If nobody has opened
  Claude Code for a while, the token is expired. Report that; do not refresh it.
- Response keys: `five_hour`, `seven_day`, `seven_day_opus`, `seven_day_sonnet`. Each has
  `utilization` (already 0–100) and `resets_at` (ISO 8601). `limits[]` carries `kind` +
  `severity` (`warning` / `critical`), and `extra_usage` covers paid overage.
- Map: `five_hour` → window `5h`, `seven_day` → `7d`.
- A second account is just another config dir (`CLAUDE_CONFIG_DIR=~/.claude2`), so read
  `~/.claude2/.credentials.json` and serve it under a second provider key.

## Codex (ChatGPT plan)

| | |
|---|---|
| Credential | `~/.codex/auth.json` → `tokens.access_token`, `tokens.account_id` |
| Request | `GET https://chatgpt.com/backend-api/wham/usage` |
| Headers | `Authorization: Bearer <access_token>`, `ChatGPT-Account-Id: <account_id>`, `originator: codex_cli_rs`, `User-Agent: codex_cli_rs/<version>` |

- `access_token` is a JWT; its `exp` claim tells you when it expires. The plan is in the claim
  `https://api.openai.com/auth` → `chatgpt_plan_type`.
- Response: `rate_limit.primary_window` / `secondary_window`, each with `used_percent` (0–100),
  `limit_window_seconds` and `reset_at` (Unix seconds) or `reset_after_seconds`. Plus
  `rate_limit.limit_reached`, `plan_type` and `credits`.
- Map by window length: up to 6 h → `5h`, 6 days or more → `7d`.
- Fallback when the token is expired or gets 401/403: start `codex app-server` once, call
  `account/rateLimits/read` (returns camelCase `usedPercent`, `windowDurationMins`, `resetsAt`),
  then close it. The CLI refreshes and writes `auth.json` itself. Do not keep it running; it
  costs about 200 MB.

## Grok (SuperGrok)

| | |
|---|---|
| Credential | `~/.grok/auth.json`: an object of entries; use the one whose key starts with `https://auth.x.ai::` and has `auth_mode: "oidc"` → `key` (also `expires_at`) |
| Request | `GET https://cli-chat-proxy.grok.com/v1/billing?format=credits` |
| Headers | `Authorization: Bearer <key>` |

- The token lives about 6 hours. When it is expired, run `grok models` once (it lists models and
  costs no inference). The CLI refreshes under its own lock (`auth.json.lock`). Judge success by
  re-reading `auth.json`, not by stdout.
- Response (sometimes wrapped in `config`): `creditUsagePercent` (0–100) and `currentPeriod`
  `{type, start, end}`; a `type` containing `WEEKLY` means a 7-day window, and `end` is the
  reset. `productUsage[]` has `{product, usagePercent}`.
- Zero values are left out of the response (proto3). If `currentPeriod` is present but
  `creditUsagePercent` is missing, the usage is 0 %, not an error.
- Passive fallback: the CLI logs `"billing: fetched credits config"` lines to
  `~/.grok/logs/unified.jsonl`. These are only as fresh as the last CLI run.

## Agent state (for `/api/agents`)

No API for this. Look at what the CLIs write locally:

| Agent | Signal |
|---|---|
| Claude Code | `~/.claude/projects/*/*.jsonl` mtime (transcripts). `~/.claude/sessions/<pid>.json` has `status` (`busy` / `idle`) for live sessions; read only `*.json` there, other files are secrets. |
| Codex | `~/.codex/sessions/*/*/*/rollout-*.jsonl` mtime |
| Grok | `~/.grok/sessions/*/*/chat_history.jsonl` and `events.jsonl` mtime |

A workable rule: a fresh write in the last minute or two, or `busy` → `working`; otherwise `idle`;
more than an hour quiet → `sleeping`. Fill `last_activity_age_sec` from the newest mtime.
A running process alone is a weak signal: background helpers can sit idle for days.
