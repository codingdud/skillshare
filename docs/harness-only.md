# Harness-only application

The active product has one model: native files belong to a Harness draft; publication snapshots the complete file tree. Agents, skills, MCP servers, hooks, and settings have no separate database identity, editing form, or publication step.

Explore calls /api/harnesses/discover. All groups results by Harness. Type filters derive components from the latest authorized published snapshot. Native Markdown names and descriptions come from frontmatter. Search covers repository metadata, file paths, and native source text. Links pin the release and select its exact file through ?release=…&file=…. Unpublished edits never enter discovery, even for owners. Results, counts, and runtime facets exclude inaccessible repositories. Retrieval currently scans authorized snapshots; a dedicated search index and semantic matching remain future work.

Saved Harnesses use harness_saves. Activity lists repository releases owned by or shared with the current user. Team access uses explicit Harness viewer invitations.

Removed from runtime:

- Standalone project/asset editors and detail pages, comparisons, and creation bridges.
- /api/assets, /api/projects, legacy community handlers, and /api/workspace.
- Individual asset save/review/variant/publish actions and project component forms.
- Legacy browser fixtures and old project seed generation.

Old URLs show the unavailable page; old API endpoints return 404. Existing authentication and OTP/session handling remain active.

## Storage retirement

Run npm run db:migrate before starting this version. Migration 006-harness-only has been applied in this workspace.

Before retiring storage, real non-fixture projects with safe, non-conflicting native paths are copied into Harness drafts, including ownership, visibility, original file content, and viewer membership. Known timestamped browser fixtures and old sample catalog projects are excluded. Drafts are not automatically published. Conflicting files are retained in archived history rather than silently selecting a winner.

All legacy project, asset, release, review, save, proposal, and activity tables are moved into the legacy_archive schema. This preserves historical records for offline recovery; the application has no handler that reads or writes them. Native-only data cannot reconstruct every old standalone feature, so old review or workflow history is not represented as a new evaluated Harness release.

Retired source and old tests are outside the active application under .local/retired-legacy. They are excluded from compilation, tests, and production bundles. Historical migrations remain for upgrades from existing databases.

The development seed now creates an inspectable native review Harness and the local demo account. It is idempotent and refuses production execution.

## Validation

35 unit/API tests and four browser tests pass. Checks cover archived storage, native file preservation, invitations, removed routes, published-only discovery, private result/facet isolation, pinned links, bookmarks, revision checks, skill/MCP editing, publication, original-tree export, and mobile layout. Typechecks and both production builds pass.

Git synchronization, native repository forks/contributions, semantic search, ZIP import, and live execution are not implemented by this retirement.
