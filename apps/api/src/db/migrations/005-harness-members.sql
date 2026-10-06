CREATE TABLE IF NOT EXISTS harness_members (
 harness_id uuid NOT NULL REFERENCES harnesses(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id),
 role text NOT NULL DEFAULT 'viewer' CHECK(role IN ('viewer','editor','publisher')),
 PRIMARY KEY(harness_id,user_id)
);
