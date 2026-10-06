CREATE TABLE harnesses (
 id uuid PRIMARY KEY,
 owner_id uuid NOT NULL REFERENCES users(id),
 name text NOT NULL,
 slug text NOT NULL,
 description text NOT NULL,
 visibility text NOT NULL CHECK(visibility IN ('private','team','public')),
 revision integer NOT NULL DEFAULT 1,
 draft_files jsonb NOT NULL DEFAULT '[]'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,slug)
);
CREATE TABLE harness_releases (
 id uuid PRIMARY KEY,
 harness_id uuid NOT NULL REFERENCES harnesses(id) ON DELETE CASCADE,
 version text NOT NULL,
 revision integer NOT NULL,
 files jsonb NOT NULL,
 notes text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(harness_id,version)
);
CREATE INDEX harness_owner_idx ON harnesses(owner_id,created_at DESC);
CREATE INDEX harness_visibility_idx ON harnesses(visibility,created_at DESC);

CREATE TABLE IF NOT EXISTS harness_members (harness_id uuid NOT NULL REFERENCES harnesses(id) ON DELETE CASCADE,user_id uuid NOT NULL REFERENCES users(id),role text NOT NULL DEFAULT 'viewer' CHECK(role IN ('viewer','editor','publisher')),PRIMARY KEY(harness_id,user_id));
