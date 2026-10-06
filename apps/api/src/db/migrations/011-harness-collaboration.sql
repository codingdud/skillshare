ALTER TABLE harnesses ADD COLUMN require_review boolean NOT NULL DEFAULT false;
-- NULL preserves existing account-wide grants. Selected grants never expand
-- when a user gains access to more Harnesses or refreshes the session.
ALTER TABLE sessions ADD COLUMN harness_grants uuid[];
ALTER TABLE device_authorizations ADD COLUMN harness_grants uuid[];
CREATE TABLE harness_proposals (
  id uuid PRIMARY KEY,
  harness_id uuid NOT NULL REFERENCES harnesses(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL, description text NOT NULL DEFAULT '',
  base_revision integer NOT NULL,
  files jsonb NOT NULL, tree_hash text NOT NULL CHECK (tree_hash ~ '^[a-f0-9]{64}$'),
  source jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','merged','closed')),
  merged_revision integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (harness_id,base_revision) REFERENCES harness_revisions(harness_id,revision),
  FOREIGN KEY (harness_id,merged_revision) REFERENCES harness_revisions(harness_id,revision)
);
CREATE INDEX harness_proposals_list ON harness_proposals(harness_id,created_at DESC,id);
CREATE TABLE harness_proposal_reviews (
  id uuid PRIMARY KEY,
  proposal_id uuid NOT NULL REFERENCES harness_proposals(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES users(id),
  tree_hash text NOT NULL CHECK (tree_hash ~ '^[a-f0-9]{64}$'),
  comment text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(proposal_id,reviewer_id)
);
CREATE FUNCTION protect_proposal_snapshot() RETURNS trigger AS $$
BEGIN
  IF ROW(NEW.harness_id,NEW.author_id,NEW.title,NEW.description,NEW.base_revision,NEW.files,NEW.tree_hash,NEW.source)
     IS DISTINCT FROM ROW(OLD.harness_id,OLD.author_id,OLD.title,OLD.description,OLD.base_revision,OLD.files,OLD.tree_hash,OLD.source) THEN
    RAISE EXCEPTION 'Proposal snapshots are immutable; submit a new proposal';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER immutable_proposal BEFORE UPDATE ON harness_proposals FOR EACH ROW EXECUTE FUNCTION protect_proposal_snapshot();
