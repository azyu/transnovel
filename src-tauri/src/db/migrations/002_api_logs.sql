CREATE TABLE IF NOT EXISTS api_logs (
    id TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    status INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    model TEXT,
    protocol TEXT NOT NULL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    request_body TEXT,
    response_body TEXT,
    error TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_logs_timestamp ON api_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_status ON api_logs (status);
