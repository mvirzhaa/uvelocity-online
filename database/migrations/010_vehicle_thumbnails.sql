-- Vehicle photos are independent of the purchase catalog, ownership and media settings.
CREATE TABLE vehicle_thumbnail_assets (
  id uuid PRIMARY KEY,
  mime_type text NOT NULL DEFAULT 'image/webp' CHECK (mime_type='image/webp'),
  bytes integer NOT NULL CHECK (bytes BETWEEN 1 AND 524288),
  width integer NOT NULL CHECK (width BETWEEN 1 AND 512),
  height integer NOT NULL CHECK (height BETWEEN 1 AND 288),
  sha256 char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  content bytea NOT NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (octet_length(content)=bytes)
);
CREATE TRIGGER vehicle_thumbnail_bytes_immutable BEFORE UPDATE ON vehicle_thumbnail_assets
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

CREATE TABLE vehicle_thumbnail_slots (
  car_id text PRIMARY KEY REFERENCES catalog_items(id),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  thumbnail_id uuid UNIQUE REFERENCES vehicle_thumbnail_assets(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO vehicle_thumbnail_slots(car_id) SELECT id FROM catalog_items WHERE kind='car';
