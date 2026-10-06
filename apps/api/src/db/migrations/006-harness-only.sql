CREATE TABLE IF NOT EXISTS harness_saves (
 user_id uuid NOT NULL REFERENCES users(id),
 harness_id uuid NOT NULL REFERENCES harnesses(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,harness_id)
);

-- Archived history has no application routes, handlers, or discovery access.
CREATE SCHEMA IF NOT EXISTS legacy_archive;
ALTER TABLE projects SET SCHEMA legacy_archive;
ALTER TABLE project_members SET SCHEMA legacy_archive;
ALTER TABLE assets SET SCHEMA legacy_archive;
ALTER TABLE asset_releases SET SCHEMA legacy_archive;
ALTER TABLE project_releases SET SCHEMA legacy_archive;
ALTER TABLE reviews SET SCHEMA legacy_archive;
ALTER TABLE review_history SET SCHEMA legacy_archive;
ALTER TABLE saves SET SCHEMA legacy_archive;
ALTER TABLE activity SET SCHEMA legacy_archive;
ALTER TABLE project_reviews SET SCHEMA legacy_archive;
ALTER TABLE project_review_history SET SCHEMA legacy_archive;
ALTER TABLE project_stars SET SCHEMA legacy_archive;
ALTER TABLE change_proposals SET SCHEMA legacy_archive;
