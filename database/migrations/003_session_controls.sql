CREATE TABLE auth_throttle (
  bucket char(64) PRIMARY KEY,
  attempts integer NOT NULL CHECK (attempts > 0),
  window_started_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE race_tickets (
  token_hash char(64) PRIMARY KEY,
  session_hash char(64) NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX race_tickets_expiry_idx ON race_tickets(expires_at);
