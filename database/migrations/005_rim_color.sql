ALTER TABLE loadouts ADD COLUMN rim_color char(7) NOT NULL DEFAULT '#c7cdd4'
  CHECK (rim_color ~ '^#[0-9a-fA-F]{6}$');
