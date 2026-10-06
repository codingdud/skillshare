ALTER TABLE projects ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS composition jsonb;
ALTER TABLE project_releases ADD COLUMN IF NOT EXISTS composition jsonb;
