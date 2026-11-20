CREATE TABLE users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE CHECK (email = lower(email) AND length(email) <= 254),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 32),
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'player' CHECK (role IN ('player','admin')),
  disabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  token_hash char(64) PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE wallets (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  balance bigint NOT NULL DEFAULT 0 CHECK (balance BETWEEN 0 AND 1000000000000000),
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0)
);

CREATE TABLE wallet_entries (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES wallets(user_id),
  delta bigint NOT NULL CHECK (delta <> 0),
  balance_after bigint NOT NULL CHECK (balance_after BETWEEN 0 AND 1000000000000000),
  wallet_version bigint NOT NULL,
  kind text NOT NULL CHECK (kind IN ('starter','purchase','admin_topup','race_reward','correction')),
  event_key text NOT NULL UNIQUE,
  actor_id uuid REFERENCES users(id),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, wallet_version)
);
CREATE INDEX wallet_entries_user_time_idx ON wallet_entries(user_id, created_at DESC, id);

CREATE TABLE catalog_items (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('car','wheel')),
  asset_key text NOT NULL,
  name text NOT NULL,
  price bigint NOT NULL CHECK (price BETWEEN 0 AND 1000000000000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}',
  UNIQUE(kind, asset_key)
);

CREATE TABLE user_items (
  user_id uuid NOT NULL REFERENCES users(id),
  item_id text NOT NULL REFERENCES catalog_items(id),
  source text NOT NULL CHECK (source IN ('starter','purchase')),
  acquired_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,item_id)
);

CREATE TABLE loadouts (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  car_item_id text NOT NULL,
  wheel_item_id text NOT NULL,
  color char(7) NOT NULL CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  finish text NOT NULL CHECK (finish IN ('metallic','gloss','matte')),
  version bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(user_id,car_item_id) REFERENCES user_items(user_id,item_id),
  FOREIGN KEY(user_id,wheel_item_id) REFERENCES user_items(user_id,item_id)
);

CREATE TABLE purchases (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  item_id text NOT NULL REFERENCES catalog_items(id),
  price_paid bigint NOT NULL CHECK (price_paid >= 0),
  catalog_version integer NOT NULL,
  ledger_entry_id uuid REFERENCES wallet_entries(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,item_id)
);

CREATE TABLE idempotency_requests (
  actor_id uuid NOT NULL REFERENCES users(id),
  operation text NOT NULL,
  key text NOT NULL CHECK (length(key) BETWEEN 8 AND 128),
  request_hash char(64) NOT NULL,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_id,operation,key)
);

CREATE TABLE rulesets (
  id bigserial PRIMARY KEY,
  version integer NOT NULL UNIQUE CHECK (version > 0),
  physics_version text NOT NULL,
  physics jsonb NOT NULL,
  reward_policy jsonb NOT NULL,
  created_by uuid REFERENCES users(id),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ruleset_cars (
  ruleset_id bigint NOT NULL REFERENCES rulesets(id),
  car_id text NOT NULL REFERENCES catalog_items(id),
  top_speed numeric(6,2) NOT NULL CHECK (top_speed BETWEEN 120 AND 450),
  zero_to_100 numeric(5,2) NOT NULL CHECK (zero_to_100 BETWEEN 1.8 AND 15),
  handling numeric(5,3) NOT NULL CHECK (handling BETWEEN 0.6 AND 1.6),
  PRIMARY KEY(ruleset_id,car_id)
);

CREATE TABLE app_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  active_ruleset_id bigint NOT NULL REFERENCES rulesets(id)
);

CREATE TABLE races (
  id uuid PRIMARY KEY,
  room_code text NOT NULL,
  circuit text NOT NULL CHECK (circuit IN ('city','beach','glacier')),
  laps integer NOT NULL CHECK (laps BETWEEN 1 AND 20),
  ruleset_id bigint NOT NULL REFERENCES rulesets(id),
  status text NOT NULL CHECK (status IN ('running','finished','aborted')),
  config jsonb NOT NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  result_hash char(64),
  settlement jsonb
);

CREATE TABLE race_participants (
  race_id uuid NOT NULL REFERENCES races(id),
  user_id uuid NOT NULL REFERENCES users(id),
  car_id text NOT NULL REFERENCES catalog_items(id),
  loadout jsonb NOT NULL,
  PRIMARY KEY(race_id,user_id)
);

CREATE TABLE race_results (
  race_id uuid NOT NULL,
  user_id uuid NOT NULL,
  position integer NOT NULL CHECK (position > 0),
  status text NOT NULL CHECK (status IN ('finished','dnf')),
  completed_laps integer NOT NULL CHECK (completed_laps >= 0),
  total_time_ms bigint CHECK (total_time_ms > 0),
  best_lap_ms bigint CHECK (best_lap_ms > 0),
  reward bigint NOT NULL CHECK (reward >= 0),
  PRIMARY KEY(race_id,user_id),
  FOREIGN KEY(race_id,user_id) REFERENCES race_participants(race_id,user_id)
);
CREATE INDEX race_results_user_idx ON race_results(user_id,race_id);

CREATE TABLE admin_audit (
  id uuid PRIMARY KEY,
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  target_id text NOT NULL,
  reason text NOT NULL,
  before_data jsonb,
  after_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_time_idx ON admin_audit(created_at DESC,id);

CREATE FUNCTION reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'append-only history cannot be changed' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER wallet_history_immutable BEFORE UPDATE OR DELETE ON wallet_entries
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER admin_history_immutable BEFORE UPDATE OR DELETE ON admin_audit
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER rulesets_immutable BEFORE UPDATE OR DELETE ON rulesets
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER ruleset_cars_immutable BEFORE UPDATE OR DELETE ON ruleset_cars
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER race_results_immutable BEFORE UPDATE OR DELETE ON race_results
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
