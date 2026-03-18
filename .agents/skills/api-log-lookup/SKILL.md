---
name: api-log-lookup
description: >
  Look up an entry in the local `api_logs` table and explain what happened.
  Use when the user explicitly asks to inspect an API log, provides a full or partial log ID,
  or asks what happened with a recorded request. Do not use for general translation failures
  unless the request is tied to a concrete log entry or the `api_logs` table.
  Triggers: API log, api_logs, log ID, log lookup, request UUID, inspect recorded request.
---

# API Log Lookup

## Use This Skill When

- The user provides a full UUID or a distinctive partial UUID for an API log entry.
- The user asks to inspect the `api_logs` table or a recorded request/response.
- The user asks what happened with a specific API call that should already be logged.

If the request is about provider auth, streaming, prompt formatting, or cache behavior without a log ID, use a different project skill first.

## Database Location

```
~/Library/Application Support/com.azyu.noveltr/novels.db
```

## Workflow

### 1. Resolve the target log entry

- If the user gave a full UUID, query that exact ID first.
- If the user gave a partial ID, list matching rows and stop if more than one row matches.
- If the user gave no ID, list recent error logs or recent logs and ask the user which row to inspect next.

Exact lookup:

```bash
sqlite3 -header -column ~/Library/Application\ Support/com.azyu.noveltr/novels.db \
  "SELECT id, datetime(timestamp/1000, 'unixepoch', 'localtime') AS time, method, path, status, duration_ms, provider, model, protocol, input_tokens, output_tokens, error FROM api_logs WHERE id = '<UUID>';"
```

Partial lookup:

```bash
sqlite3 -header -column ~/Library/Application\ Support/com.azyu.noveltr/novels.db \
  "SELECT id, datetime(timestamp/1000, 'unixepoch', 'localtime') AS time, status, provider, model, error FROM api_logs WHERE id LIKE '<partial>%' ORDER BY timestamp DESC;"
```

Recent error context:

```bash
sqlite3 -header -column ~/Library/Application\ Support/com.azyu.noveltr/novels.db \
  "SELECT id, datetime(timestamp/1000, 'unixepoch', 'localtime') AS time, status, provider, model, duration_ms, error FROM api_logs WHERE status >= 400 ORDER BY timestamp DESC LIMIT 10;"
```

Recent log context:

```bash
sqlite3 -header -column ~/Library/Application\ Support/com.azyu.noveltr/novels.db \
  "SELECT id, datetime(timestamp/1000, 'unixepoch', 'localtime') AS time, status, provider, model, duration_ms, input_tokens, output_tokens, error FROM api_logs ORDER BY timestamp DESC LIMIT 20;"
```

### 2. Handle missing or ambiguous results

- If the exact lookup returns `0` rows, say that no log entry was found for that ID.
- If the partial lookup returns multiple rows, show the matching IDs and stop until the user picks one.
- If the partial lookup returns exactly one row, continue with that resolved ID.

### 3. Inspect summary fields before payloads

Must summarize these fields first:

- `status`
- `provider`
- `model`
- `duration_ms`
- `input_tokens`
- `output_tokens`
- `error`

Interpretation rules:

- `status >= 400` means the provider returned an error response.
- `status = 0` with an `error` value means the request failed before a normal HTTP response was stored.
- `output_tokens` equal to `0` or `NULL` alongside missing paragraphs usually means the response stopped early or the model did not follow the required `<p id="...">` format.

### 4. Inspect bodies only when needed

Request body:

```bash
sqlite3 ~/Library/Application\ Support/com.azyu.noveltr/novels.db \
  "SELECT request_body FROM api_logs WHERE id = '<UUID>';"
```

Response body:

```bash
sqlite3 ~/Library/Application\ Support/com.azyu.noveltr/novels.db \
  "SELECT response_body FROM api_logs WHERE id = '<UUID>';"
```

- Open the request body when the failure might be caused by prompt shape, model selection, auth, or wrong endpoint.
- Open the response body when the failure might be caused by truncation, malformed SSE, provider-side errors, or missing translated paragraphs.
- Summarize payloads instead of pasting raw secrets or full long bodies unless the user explicitly asks for the raw content.

### 5. Report the result

Must finish with:

- what happened
- where it failed: request setup, provider response, or response parsing
- the strongest evidence from the log row
- the next file or skill to inspect if the log alone is not enough

## Schema Reference

```sql
api_logs (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  model TEXT,
  provider TEXT NOT NULL,
  protocol TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  request_body TEXT,
  response_body TEXT,
  error TEXT
)
```

## Common Findings

| Evidence | Likely conclusion |
|---------|-------------------|
| `status = 401` | The stored credential was rejected. |
| `status = 429` | The provider rate-limited the request. |
| `status >= 500` | The provider returned a server-side failure. |
| `error` is populated and `status = 0` | The request failed before a normal HTTP response was persisted. |
| Request body looks correct but response body is incomplete | Continue with `llm-api-integration` for transport or provider parsing. |
| Response body omits some `<p id="...">` blocks | Continue with `translation-pipeline` for paragraph parsing and retry behavior. |
