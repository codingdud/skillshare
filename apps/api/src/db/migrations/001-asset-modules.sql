-- Additive migration: existing rows and immutable release snapshots are untouched.
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_type_check;
ALTER TABLE assets ADD CONSTRAINT assets_type_check CHECK (type IN ('skill','agent','workflow','mcp','hook','settings'));
