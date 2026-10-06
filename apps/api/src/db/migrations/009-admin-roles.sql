ALTER TABLE users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_revision integer NOT NULL DEFAULT 1;
CREATE TABLE admin_audit_events (
 id bigserial PRIMARY KEY,
 actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
 target_id uuid REFERENCES users(id) ON DELETE SET NULL,
 action text NOT NULL CHECK(action IN ('auth.login','auth.logout','profile.updated','user.role_changed','admin.access_denied')),
 summary text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_created_idx ON admin_audit_events(created_at DESC,id DESC);
CREATE INDEX user_role_idx ON users(role,id);
