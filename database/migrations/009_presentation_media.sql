-- Assets live in PostgreSQL so the existing database volume/backup preserves them.
CREATE TABLE presentation_assets (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('garage_music','loading_image')),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  mime_type text NOT NULL,
  bytes integer NOT NULL CHECK (bytes > 0),
  sha256 char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  content bytea NOT NULL,
  duration_seconds double precision,
  width integer,
  height integer,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (octet_length(content) = bytes),
  CHECK ((kind='garage_music' AND mime_type='audio/mpeg' AND bytes<=20971520
          AND duration_seconds IS NOT NULL AND duration_seconds>0 AND duration_seconds<=3600 AND width IS NULL AND height IS NULL)
      OR (kind='loading_image' AND mime_type='image/jpeg' AND bytes<=10485760
          AND duration_seconds IS NULL AND width IS NOT NULL AND height IS NOT NULL AND width BETWEEN 1 AND 8192 AND height BETWEEN 1 AND 8192
          AND width::bigint*height<=24000000)),
  UNIQUE(kind,sha256)
);
CREATE INDEX presentation_assets_created_idx ON presentation_assets(created_at DESC,id);
-- A URL always identifies the same bytes; replacing an asset creates a new UUID.
CREATE TRIGGER presentation_asset_bytes_immutable BEFORE UPDATE ON presentation_assets
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

CREATE TABLE presentation_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  garage_music_id uuid REFERENCES presentation_assets(id) ON DELETE RESTRICT,
  loading_image_id uuid REFERENCES presentation_assets(id) ON DELETE RESTRICT,
  music_volume double precision NOT NULL DEFAULT 0.35 CHECK (music_volume BETWEEN 0 AND 1),
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO presentation_settings(singleton) VALUES (true);
