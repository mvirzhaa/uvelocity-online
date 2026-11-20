-- Each account keeps only its current chosen location and the active pause latch.
-- No location history or private coordinates are added to races/room snapshots.
CREATE TABLE user_prayer_state (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  location_mode text NOT NULL DEFAULT 'fallback' CHECK (location_mode IN ('gps','manual','fallback')),
  city_id text DEFAULT 'jakarta',
  location_label text NOT NULL DEFAULT 'Jakarta (lokasi awal)',
  latitude numeric(7,4) NOT NULL DEFAULT -6.2088 CHECK (latitude BETWEEN -90 AND 90),
  longitude numeric(8,4) NOT NULL DEFAULT 106.8456 CHECK (longitude BETWEEN -180 AND 180),
  timezone text NOT NULL DEFAULT 'Asia/Jakarta',
  active_event_id text,
  active_prayer text CHECK (active_prayer IN ('fajr','dhuhr','asr','maghrib','isha')),
  pause_started_at timestamptz,
  pause_until timestamptz,
  location_updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (active_event_id IS NULL AND active_prayer IS NULL AND pause_started_at IS NULL AND pause_until IS NULL)
    OR (active_event_id IS NOT NULL AND active_prayer IS NOT NULL AND pause_started_at IS NOT NULL AND pause_until IS NOT NULL
      AND pause_until = pause_started_at + interval '15 minutes')
  )
);

INSERT INTO user_prayer_state(user_id) SELECT id FROM users ON CONFLICT DO NOTHING;
