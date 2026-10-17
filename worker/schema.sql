PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS workshops (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 0 CHECK(must_change_password IN (0,1)),
  name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
  subscription_status TEXT NOT NULL DEFAULT 'pending' CHECK(subscription_status IN ('pending','active','expired','suspended')),
  subscription_expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  workshop_id TEXT NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_workshop_idx ON sessions(workshop_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS workspace_data (
  workshop_id TEXT PRIMARY KEY REFERENCES workshops(id) ON DELETE CASCADE,
  data_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  workshop_id TEXT REFERENCES workshops(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_workshop_idx ON audit_log(workshop_id, created_at);

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
