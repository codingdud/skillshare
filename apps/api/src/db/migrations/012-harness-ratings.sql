CREATE TABLE IF NOT EXISTS harness_ratings (
  id uuid PRIMARY KEY,
  harness_id uuid NOT NULL REFERENCES harnesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (harness_id, user_id)
);
CREATE INDEX IF NOT EXISTS harness_ratings_harness_created_idx ON harness_ratings (harness_id, created_at DESC);
