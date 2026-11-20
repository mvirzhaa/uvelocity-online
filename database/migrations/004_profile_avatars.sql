ALTER TABLE users ADD COLUMN avatar_id text NOT NULL DEFAULT 'driver-1'
  CHECK (avatar_id IN ('driver-1','driver-2','driver-3','driver-4','driver-5','driver-6'));
