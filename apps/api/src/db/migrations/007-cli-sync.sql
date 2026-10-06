ALTER TABLE sessions ADD COLUMN client_kind text NOT NULL DEFAULT 'browser' CHECK(client_kind IN ('browser','cli'));
ALTER TABLE sessions ADD COLUMN scopes text[] NOT NULL DEFAULT '{}';
ALTER TABLE sessions ADD COLUMN label text NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN last_used_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE device_authorizations (
 device_hash text PRIMARY KEY, code_hash text UNIQUE NOT NULL,
 scopes text[] NOT NULL, label text NOT NULL,
 expires_at timestamptz NOT NULL, next_poll_at timestamptz NOT NULL DEFAULT now(),
 poll_interval integer NOT NULL DEFAULT 5,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','denied','consumed')),
 user_id uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE harness_revisions (
 id uuid PRIMARY KEY, harness_id uuid NOT NULL REFERENCES harnesses(id) ON DELETE CASCADE,
 revision integer NOT NULL, files jsonb NOT NULL, author_id uuid REFERENCES users(id),
 source text NOT NULL, message text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(harness_id,revision)
);
INSERT INTO harness_revisions(id,harness_id,revision,files,source,message)
SELECT md5(id::text || ':initial')::uuid,id,revision,draft_files,'migration','Existing draft snapshot; earlier drafts were not retained' FROM harnesses;
CREATE TABLE harness_changesets (
 harness_id uuid NOT NULL REFERENCES harnesses(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id), request_id uuid NOT NULL,
 request_hash text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(harness_id,user_id,request_id)
);
CREATE INDEX harness_revision_history ON harness_revisions(harness_id,revision DESC);
CREATE INDEX device_expiration ON device_authorizations(expires_at);
