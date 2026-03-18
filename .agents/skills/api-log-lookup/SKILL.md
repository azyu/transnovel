---
name: api-log-lookup
description: >
  Look up and debug API logs by UUID in the TransNovel app.
  Use when user provides an API log UID/UUID and wants to investigate a translation API call,
  debug an error, or inspect request/response payloads. Also use when user says
  "check this API log", "look up log", "what happened with this request",
  or provides a UUID string in the context of debugging.
  Triggers: API log, UUID, log lookup, debug API call, inspect request, translation error,
  API error, request payload, response payload.
---

# API Log Lookup

## Overview

The TransNovel stores every LLM API call in SQLite (`api_logs` table). Each log entry has a UUID v4 primary key. This skill retrieves and analyzes log entries by their UID.

## Database Location

```
~/Library/Application Support/com.azyu.transnovel/novels.db
```

## Lookup Procedure

### 1. Query by UUID

```bash
sqlite3 ~/Library/Application\ Support/com.azyu.transnovel/novels.db \
  "SELECT id, timestamp, method, path, status, duration_ms, model, provider, protocol, input_tokens, output_tokens, error FROM api_logs WHERE id = '<UUID>';"
```

### 2. Get Full Request/Response Payloads

```bash
sqlite3 ~/Library/Application\ Support/com.azyu.transnovel/novels.db \
  "SELECT request_body FROM api_logs WHERE id = '<UUID>';"
```

```bash
sqlite3 ~/Library/Application\ Support/com.azyu.transnovel/novels.db \
  "SELECT response_body FROM api_logs WHERE id = '<UUID>';"
```

### 3. Get Recent Logs (Context)

```bash
sqlite3 -header -column ~/Library/Application\ Support/com.azyu.transnovel/novels.db \
  "SELECT id, datetime(timestamp/1000, 'unixepoch', 'localtime') as time, status, provider, model, duration_ms, input_tokens, output_tokens, error FROM api_logs ORDER BY timestamp DESC LIMIT 20;"
```

### 4. Find Logs by Partial UUID

```bash
sqlite3 -header -column ~/Library/Application\ Support/com.azyu.transnovel/novels.db \
  "SELECT id, datetime(timestamp/1000, 'unixepoch', 'localtime') as time, status, provider, model, error FROM api_logs WHERE id LIKE '<partial>%' ORDER BY timestamp DESC;"
```

### 5. Find Error Logs

```bash
sqlite3 -header -column ~/Library/Application\ Support/com.azyu.transnovel/novels.db \
  "SELECT id, datetime(timestamp/1000, 'unixepoch', 'localtime') as time, status, provider, model, error FROM api_logs WHERE status >= 400 ORDER BY timestamp DESC LIMIT 10;"
```

## Schema

```sql
api_logs (
  id TEXT PRIMARY KEY,          -- UUID v4
  timestamp INTEGER NOT NULL,   -- Unix millis
  method TEXT NOT NULL,         -- HTTP method (POST)
  path TEXT NOT NULL,           -- API endpoint URL
  status INTEGER NOT NULL,     -- HTTP status code
  duration_ms INTEGER NOT NULL, -- Request duration
  model TEXT,                   -- LLM model name
  provider TEXT NOT NULL,       -- Gemini, OpenRouter, Codex, etc.
  protocol TEXT NOT NULL,       -- API protocol type
  input_tokens INTEGER,        -- Prompt tokens
  output_tokens INTEGER,       -- Completion tokens
  request_body TEXT,           -- Full JSON request
  response_body TEXT,          -- Full JSON response
  error TEXT                   -- Error message if failed
)
```

## Analysis Checklist

When investigating a log entry:

1. **Status code**: 200 = success, 4xx = client error (bad request/auth), 5xx = server error
2. **Duration**: Normal is 5-60s for translation. >120s likely timeout
3. **Tokens**: Check if output_tokens is suspiciously low (truncated response)
4. **Error field**: Contains error message if request failed
5. **Request body**: Check prompt format, paragraph count, system prompt
6. **Response body**: Check if response was truncated, malformed, or missing paragraphs

## Common Issues

| Symptom | Check | Likely Cause |
|---------|-------|--------------|
| status=401 | API key | Invalid or expired key |
| status=429 | Rate limit | Too many requests, wait and retry |
| status=500 | response_body | Provider server error |
| Low output_tokens | response_body | Model hit token limit, response truncated |
| error="API 요청 실패" | Network | Connection timeout or DNS failure |
| Missing paragraphs | response_body | Model didn't translate all `<p>` tags |
