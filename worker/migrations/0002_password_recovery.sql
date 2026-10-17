CREATE TABLE IF NOT EXISTS password_recovery_requests (
  id TEXT PRIMARY KEY,
  workshop_id TEXT REFERENCES workshops(id) ON DELETE SET NULL,
  username TEXT NOT NULL,
  contact_phone TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','resolved')),
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS recovery_username_created_idx ON password_recovery_requests(username, created_at);
CREATE INDEX IF NOT EXISTS recovery_status_created_idx ON password_recovery_requests(status, created_at);
