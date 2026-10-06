CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY, name text NOT NULL, email text UNIQUE NOT NULL, password_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), expires_at timestamptz NOT NULL, revoked boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS refresh_tokens (
 hash text PRIMARY KEY, session_id uuid NOT NULL REFERENCES sessions(id), used boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refresh_session_idx ON refresh_tokens(session_id);
CREATE TABLE IF NOT EXISTS projects (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id), name text NOT NULL, slug text NOT NULL,
 description text NOT NULL, visibility text NOT NULL CHECK(visibility IN ('private','team','public')), readme text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(owner_id,slug)
);
CREATE TABLE IF NOT EXISTS project_members (
 project_id uuid NOT NULL REFERENCES projects(id), user_id uuid NOT NULL REFERENCES users(id), PRIMARY KEY(project_id,user_id)
);
CREATE TABLE IF NOT EXISTS assets (
 id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id), type text NOT NULL CHECK(type IN ('skill','agent','workflow','mcp','hook','settings')),
 content jsonb NOT NULL, revision integer NOT NULL DEFAULT 1, parent_id uuid REFERENCES assets(id), original_id uuid REFERENCES assets(id),
 source_release_id uuid, source_name text, source_version text, source_owner text, changes text, latest_release_id uuid,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assets_project_idx ON assets(project_id);
CREATE INDEX IF NOT EXISTS assets_parent_idx ON assets(parent_id);
CREATE TABLE IF NOT EXISTS asset_releases (
 id uuid PRIMARY KEY, asset_id uuid NOT NULL REFERENCES assets(id), version text NOT NULL, content jsonb NOT NULL, notes text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(asset_id,version)
);
CREATE INDEX IF NOT EXISTS release_search_idx ON asset_releases USING gin(to_tsvector('english', (content->>'name') || ' ' || (content->>'summary') || ' ' || (content->>'tags')));
CREATE TABLE IF NOT EXISTS project_releases (
 id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id), version text NOT NULL, manifest jsonb NOT NULL, export_plan jsonb, notes text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(project_id,version)
);
CREATE TABLE IF NOT EXISTS reviews (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), asset_id uuid NOT NULL REFERENCES assets(id), release_id uuid NOT NULL REFERENCES asset_releases(id),
 rating integer NOT NULL CHECK(rating BETWEEN 1 AND 5), body text NOT NULL, task text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,asset_id)
);
CREATE TABLE IF NOT EXISTS review_history (
 id uuid PRIMARY KEY, review_id uuid NOT NULL REFERENCES reviews(id), content jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS saves (user_id uuid NOT NULL REFERENCES users(id), asset_id uuid NOT NULL REFERENCES assets(id), PRIMARY KEY(user_id,asset_id));
CREATE TABLE IF NOT EXISTS activity (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), project_id uuid NOT NULL REFERENCES projects(id), asset_id uuid REFERENCES assets(id), message text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS source_project_id uuid REFERENCES projects(id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS source_release_id uuid REFERENCES project_releases(id);
CREATE TABLE IF NOT EXISTS project_reviews (
 id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id),user_id uuid NOT NULL REFERENCES users(id),release_id uuid NOT NULL REFERENCES project_releases(id),rating integer NOT NULL CHECK(rating BETWEEN 1 AND 5),body text NOT NULL,task text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(project_id,user_id)
);
CREATE TABLE IF NOT EXISTS project_review_history (
 id uuid PRIMARY KEY,review_id uuid NOT NULL REFERENCES project_reviews(id),content jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS project_stars (project_id uuid NOT NULL REFERENCES projects(id),user_id uuid NOT NULL REFERENCES users(id),PRIMARY KEY(project_id,user_id));
CREATE TABLE IF NOT EXISTS change_proposals (
 id uuid PRIMARY KEY,asset_id uuid NOT NULL REFERENCES assets(id),author_id uuid NOT NULL REFERENCES users(id),base_release_id uuid NOT NULL REFERENCES asset_releases(id),title text NOT NULL,summary text NOT NULL,content jsonb NOT NULL,status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','merged','closed')),created_at timestamptz NOT NULL DEFAULT now(),decided_at timestamptz
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
CREATE TABLE IF NOT EXISTS email_challenges (
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),purpose text NOT NULL CHECK(purpose IN ('verify_email','reset_password')),code_hash text NOT NULL,attempts integer NOT NULL DEFAULT 0,expires_at timestamptz NOT NULL,consumed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,purpose)
);
CREATE TABLE IF NOT EXISTS password_reset_grants (
 hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),expires_at timestamptz NOT NULL,consumed_at timestamptz
);
CREATE INDEX IF NOT EXISTS reset_user_idx ON password_reset_grants(user_id);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS composition jsonb;
ALTER TABLE project_releases ADD COLUMN IF NOT EXISTS composition jsonb;
