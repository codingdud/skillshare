ALTER TABLE harness_revisions ADD COLUMN tree_hash text;
ALTER TABLE harness_revisions ADD COLUMN parent_id uuid;
ALTER TABLE harness_revisions ADD CONSTRAINT revision_identity UNIQUE(harness_id,id);
ALTER TABLE harness_revisions ADD CONSTRAINT revision_parent FOREIGN KEY(harness_id,parent_id) REFERENCES harness_revisions(harness_id,id);
ALTER TABLE harness_releases ADD COLUMN tree_hash text;
ALTER TABLE harness_releases ADD COLUMN revision_id uuid;
ALTER TABLE harness_releases ADD CONSTRAINT release_snapshot FOREIGN KEY(harness_id,revision_id) REFERENCES harness_revisions(harness_id,id);
ALTER TABLE harness_revisions ADD CONSTRAINT revision_checksum CHECK(tree_hash IS NULL OR tree_hash ~ '^[a-f0-9]{64}$');
ALTER TABLE harness_releases ADD CONSTRAINT release_checksum CHECK(tree_hash IS NULL OR tree_hash ~ '^[a-f0-9]{64}$');
-- Historical published snapshots existed before working history. Preserve their contents
-- without claiming that missing draft revisions or authors can be reconstructed.
INSERT INTO harness_revisions(id,harness_id,revision,files,source,message,created_at)
SELECT DISTINCT ON (r.harness_id,r.revision) md5(r.id::text || ':release-snapshot')::uuid,r.harness_id,r.revision,r.files,'migration','Historical published snapshot; intervening drafts were not retained',r.created_at
FROM harness_releases r WHERE NOT EXISTS(SELECT 1 FROM harness_revisions v WHERE v.harness_id=r.harness_id AND v.revision=r.revision)
ORDER BY r.harness_id,r.revision,r.created_at,r.id;
UPDATE harness_revisions r SET parent_id=p.id FROM harness_revisions p WHERE p.harness_id=r.harness_id AND p.revision=r.revision-1 AND r.source <> 'migration';
UPDATE harness_releases r SET revision_id=v.id FROM harness_revisions v WHERE v.harness_id=r.harness_id AND v.revision=r.revision AND v.files=r.files;
CREATE FUNCTION protect_harness_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Published snapshots and working revisions are immutable' USING ERRCODE='23514'; END;
$$;
-- Updates to integrity columns alone are allowed for migration/backfill. Content is immutable.
CREATE TRIGGER immutable_harness_revision BEFORE UPDATE OF files,revision,harness_id,author_id,source,message,created_at ON harness_revisions FOR EACH ROW EXECUTE FUNCTION protect_harness_snapshot();
CREATE TRIGGER immutable_harness_release BEFORE UPDATE OF files,revision,harness_id,version,notes,created_at ON harness_releases FOR EACH ROW EXECUTE FUNCTION protect_harness_snapshot();
