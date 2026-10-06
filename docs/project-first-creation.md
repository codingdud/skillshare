# Project-first creation and editing

> Design direction superseded by [Harness repository redesign plan](harness-repository-plan.md). This document describes the existing component-based implementation; the new plan replaces mandatory component creation/publication with one native repository editor and Harness release.

The project is the primary unit for creation, configuration, workflow composition, and publication. A custom workflow is a way to assemble a project, not another required item to create alongside it.

## Redundancy found

- Global Create offers a project plus six separate asset creation destinations.
- Project Add asset opens another full-page type picker, then a separate editor repeats project selection and metadata.
- Workflow assets duplicate the project's role as a container of exact component releases.
- Prompt forms and native file editors expose overlapping instruction/configuration editing paths.

## Revised flow

Create project → choose a blank file-based project or a custom workflow project → add/select project components → edit their native files in Monaco → review and publish components → publish the project release.

Global Create offers a project only. The project editor includes Files, optional Workflow builder, and component release controls. Component kind and target harness choose a native template; they do not open separate top-level creation sections. Monaco opens after selecting a component. Unsupported harness formats remain unavailable.

The workflow builder stores its composition on the project and project release, reuses exact published component references, and retains native hook events and optional stages. Published custom projects can be reused through the existing attributed project fork flow. A fork preserves its source project/release and starts with independent drafts.

## Differences that must remain

Skill, agent, MCP, hook, and settings formats have different semantics and validation. Their identities, releases, reuse permissions, dependency references, and attribution remain intact behind the unified interface. Published releases are immutable; file edits create drafts. Referenced community components require an attributed adaptation before editing. Configuration composition never authorizes tools or executes commands.

## Migration and recovery

Existing standalone workflow releases remain readable/exportable and editable for compatibility. They are removed from new top-level creation choices; new custom compositions belong to projects. Existing asset APIs remain compatible. Old creation links with a project lead into its file editor; links without a project select/create one first. Save conflicts retain local edits, with explicit compare/reload/retry choices. Project draft composition is owner-only; other readers see only the published snapshot.

Validation must cover project-context creation of all five component types, immediate Monaco editing, project composition/release persistence, immutable snapshots, permission filtering, reusable forks, migration/idempotency, and responsive/auth regression journeys.

## Shipped workspace behavior

- Global creation has a single project entry. The project creation screen offers **Project files** or **Custom workflow project**.
- Project **Edit project files** opens the component list and native file workspace. **Add component** chooses a type, harness, name, and purpose, then opens Monaco directly. Unsupported template combinations are disabled.
- File contents remain the instruction/configuration editing surface. Optional Details holds discovery metadata and requirements; Dependencies holds exact release references for agents. Native file/folder creation, rename, deletion, and source inspection use the existing explorer.
- Valid component edits autosave with revision checks. Switching components retains local drafts; leaving the project warns about unsaved work. Conflict recovery supports comparing/reloading the latest draft or explicitly retaining local content with the new revision.
- **Workflow builder** stores a project composition, with selected skill/agent/MCP/settings/hook releases, native event inspection, optional stages, conflict review, and editable JSON in Monaco. Invalid JSON remains available for correction and blocks saving; switching project tabs preserves it.
- Reference files open read-only. **Adapt and edit in this project** creates an attributed component draft. Publishing replaces the corresponding workflow pin with the variant release rather than changing its source.
- A project release freezes the saved composition and exact resolved release references. Fully native compositions also pin the export plan automatically. Older component releases selected in the composition override latest-release guesses in its manifest.
- Project Export emits .skillshare/project.json, native component files, and the existing versioned lock. Recipe JSON declares component reuse terms without inventing a project-wide license. Root project and component source attribution are retained.

## API and migration

| Route                                           | Purpose                                                                             |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| GET /api/projects/:id/components?page=1         | Owner-only paginated native component drafts, including unpublished entries         |
| PUT /api/projects/:id/composition               | Revision-aware project composition save; validates references and access            |
| GET /api/projects/:id/recipe?release=:releaseId | Authorized recipe from an immutable project release                                 |
| POST /api/projects/:id/releases                 | Snapshots composition, pins resolved references, validates the complete publication |
| Existing project export endpoints               | Enforce the released composition/plan and include the project recipe                |

Migration **003-project-composition** adds project revision/composition and release composition fields. It is additive and idempotent; existing workflow assets and project release snapshots are not rewritten. The migration was applied to the local database. Normal setup/upgrade uses **npm run db:migrate**.

Project detail and list responses expose draft composition only to the owner; other permitted readers receive the latest published composition. Draft-component listings require owner authorization. Preview, publication, recipe download, native export, and fork access are rechecked by the backend. Existing auth/session/OTP flows are retained.

Old /create/:type links select a project first or enter the supplied project directly. Old /edit/:assetId links resolve the canonical home project and open its component editor. Existing workflow assets retain the compatibility editor and offer an explicit draft action to move a V2 composition into their project. A workflow is not silently converted into a new project or deleted.

## Remaining limits

Projects continue to own reusable typed component identities; simplifying navigation does not flatten skill, agent, hook, MCP, and settings semantics into interchangeable files. Component releases and project releases remain separate snapshots. Published source content cannot be edited in place. Execution, runtime credentials, workflow callbacks, automatic cross-harness translation, and per-stage environments remain separate work.
