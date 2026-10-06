# Workflow composition implementation

Implemented 2026-10-02. **Creation flow update:** new custom workflows now live on projects and project releases; use [the project-first editor](project-first-creation.md). The standalone workflow editor described below remains for existing assets and compatibility. This delivers slices 1–4 of the approved [workflow scope](workflow-composition-scope.md): contracts, builder, detail/reuse, and export integration. Execution is separate.

## Use the workflow builder

1. Open a project, choose **Add asset → Workflow**, then enter a name and purpose. Select the target harness in Basics.
2. In **Components**, choose Skills, Agents, MCP servers, Harness settings, or Hooks. Search published assets and select the exact release before adding it. Different harness packages and unsupported configuration kinds cannot be selected.
3. Inspect pinned components and their creator. **Change release** updates the pin without changing the component ID or removing its stages. Removing a component removes its stages. Release changes clear conflict choices and invalidate the composition preview.
4. In **Hooks**, inspect native pre/post events, matchers, and handler source. A module defining both events is installed once. These are native lifecycle events, not workflow callbacks.
5. **Stages** are optional. Only pinned skills and agents can be stages; the same component can appear more than once. Describe input mappings, output, human approval, failure behavior, retry limits, and timeout.
6. In **Review**, resolve the accessible direct and inherited releases, inspect effective files, and explicitly choose conflicting configuration definitions. Text-file collisions require removing the conflict or creating a variant with a distinct path.
7. Save the draft or publish a release. Purpose, target, and at least one component are required; fabricated instruction text and execution stages are not required.
8. On the published page, **Use workflow** offers the JSON recipe and, when every required release has native files and composition passes, the native ZIP. Project Export also accepts workflow roots and freezes reviewed plans in new project releases.

The editor uses a wide canvas and preserves existing autosave, revision-conflict recovery, mobile navigation, and dark mode. Component release links open exact versions.

## Shared contract and validation

The additive content.workflow payload has schemaVersion 2:

- target: one canonical harness ID, optional author-declared runtimeRange; VS Code uses the supported Local session target.
- components: stable local id, role (skill, agent, mcp, settings, hook), and immutable releaseId; maximum 50 direct components.
- stages: optional ordered stage records referring to componentId; maximum 30. Inputs reference input or earlier stage IDs.
- resolutions: explicit file/pointer/release choices for shared configuration conflicts.

Strict Zod objects reject unsupported stage scopes and runner callback fields. A V2 workflow uses this manifest as its sole composition representation; parallel legacy dependencies/modules/stages and a fabricated root nativePackage are rejected.

The shared release-reference extractor supports details, conversion, and recursive export. Publication and proposal acceptance recheck exact release access, role, project restrictions, target/session compatibility, supported configuration kinds, duplicate pins, cycles/self-references, stage mappings, native diagnostics, and unresolved conflicts. Resolving two versions of one asset into the same installation is blocked. Traversal is bounded to 100 releases.

Instructions-only skill/agent releases may be part of a recipe. They are explicitly listed as missing native packages; a ZIP that omits required components is blocked. Missing or inaccessible references block preview/export rather than being silently omitted.

A workflow remains an ordinary project-owned asset with existing drafts, variants, proposals, reviews, and release history. Variants preserve the immediate source and original lineage. Comparison shows added/removed components, version changes, target changes, native hook handler changes, and the complete manifest difference. Proposals can edit the manifest and show highlighted JSON differences; invalid references are revalidated on merge.

## Backend endpoints

| Endpoint                                                | Behavior                                                                                                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| POST /api/assets/workflows/preview                      | Owner-authorized project/draft composition; returns effective files, conflicts, diagnostics, exact resolved releases and missing native packages |
| GET /api/assets/:id/workflow-preview?release=:releaseId | Authorized immutable release composition                                                                                                         |
| GET /api/assets/:id/recipe?release=:releaseId           | Authorized attributed workflow recipe JSON                                                                                                       |
| GET /api/assets/:id/export?release=:releaseId           | Complete native ZIP when all references are accessible/exportable                                                                                |
| GET /api/assets/releases/:releaseId                     | Authorized exact release content, identity, type, version, and creator for picking and inspection                                                |

Existing create/update/publish/variant/proposal APIs are reused. Project preview/export uses the existing exact manifest and pinned export-plan rules. Downloads recheck access; a previous successful preview is not an authorization grant.

## Export format and attribution

A native archive includes the composed component files, SKILLSHARE-README.md, skillshare-lock.json, and a recipe at:

    .skillshare/workflows/<normalized-name>-<full-asset-UUID>.json

This recipe path is a SkillShare convention, not a vendor workflow format. Including the immutable asset UUID avoids same-name workflow collisions. The recipe declares schemaVersion 2 and adapterVersion 1; the lock declares formatVersion 3 and adapterVersion 1.

Both standalone and embedded recipes identify the workflow asset/release/version/owner and its immediate source, original identity, and parent. Resolved components record exact versions, owners, licenses, and source attribution. The lock includes all root and transitive releases, the target harness, and conflict choices. Archive timestamps are fixed for deterministic bytes.

Selecting workflow roots together still requires a review of combined files. Workflow-pinned choices cannot be overridden by a conflicting project export choice; adapting them requires a draft/variant. Changing a frozen project plan requires a new project release.

## Compatibility

No SQL migration is needed for this additive JSONB payload. Existing workflow releases remain unchanged and readable. The legacy editor requires selecting a harness and **Convert this draft**; it resolves exact old references, deduplicates repeated stage releases into components, and preserves their stage mappings. Saving uses the current draft revision. Publishing the converted draft creates a new release rather than rewriting the previous snapshot.

Current native export requires the V2 target declaration. Older stage workflows must be explicitly converted before native export. Native component packages and earlier release snapshots continue to use their existing formats/readers.

Profiles follow the existing capability registry: Claude Code, Gemini CLI, Copilot in VS Code (Local), Copilot CLI, and Copilot cloud. Unsupported standalone CLI settings and cloud MCP/settings remain unavailable. Agent-owned inline hooks stay in their original native files/scope; transitive configuration appears in the effective file review.

## Validation evidence

- **105 unit/API tests passed**, including 13 new workflow contract/integration checks for five-role composition, optional stages, conflicts, recipe-only behavior, exact exports, lineage, proposals, and permission changes.
- **Seven browser tests passed** in clean runs: the five existing discovery/auth/native-editor/module journeys plus five-component workflow composition/export and explicit legacy conversion. Workflow coverage checks older release selection, changing pins, save/reload, native pre/post groups, mobile overflow, publication without stages, and recipe/ZIP downloads. Conversion coverage checks the original published snapshot remains unchanged.
- Contracts, API, and web TypeScript checks passed.
- Frontend and API production bundles built. A fresh built API returned HTTP 200 for health and the harness registry with five profiles.

The managed environment restricts esbuild parent-directory discovery. Backend bundle verification used the existing workspace-confined resolver with the same tsup build options; normal npm build scripts were not changed. The frontend build retains its existing Monaco/main-chunk size warnings.

## Execution limits

This is configuration composition and publication. No model task, hook command, MCP connection, workflow callback, or external write is executed. Native event grouping preserves the vendor boundary; contribution ordering only controls generated source, not guaranteed runtime hook sequencing. Structural checks and author runtime declarations are not runtime compatibility evidence.

Nested workflows, per-stage environment overrides, cross-harness automatic conversion, canvas orchestration, and live runs remain outside this update.
