# Workflow composition: update scope

Status: approved scope; slices 1–4 are implemented. See [workflow-composition-implementation.md](workflow-composition-implementation.md) for the shipped contract, usage, compatibility, validation results, and remaining execution limits.
Reviewed 2026-10-02 against the current contracts, editor, publication service, and export service.

## Product definition

A workflow is a versioned, attributed combination of **skills, agents, MCP connections, harness settings, and hooks** for a task. Its members reference exact published releases. It can be useful as an installable configuration without an execution sequence. Optional stages describe how selected skills and agents should work together.

The default creation experience is a composition builder. Ordered stages are optional. MCP connections supply tools; settings configure the harness; hooks respond to declared events. These do not become artificial agent stages.

A project remains the canonical owner of each asset. Workflow components are references, not copied assets or new owners. A variant receives its own workflow identity and release history while retaining its exact source attribution. A project release can contain several workflows; a workflow release pins one composition.

## Pre-implementation audit

| Area                     | Current behavior                                                     | Required update                                                                              |
| ------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Composition picker       | Workflow only allows skill/agent results                             | Expose all five building-block kinds, filtered by target capability                          |
| Workflow content         | Uses content.stages with one skill/agent release per stage           | Add an explicit composition manifest; keep stages optional                                   |
| Configuration references | content.modules is restricted to agents                              | Allow typed workflow component references through the new manifest                           |
| Publication              | Requires at least one stage and prompt instructions                  | Validate a nonempty composition, exact references, and applicable output contracts           |
| Profile                  | Workflows have no target profile                                     | Select an explicit harness/session target for a native composition                           |
| Export                   | Requires a nativePackage on every root; workflow roots cannot export | Resolve the manifest, traverse its pinned dependencies, compose native files, include recipe |
| Project export           | Checkbox only enables assets with nativePackage                      | Offer compatible workflow releases as export roots                                           |
| Detail/comparison        | Shows generic dependencies/stages and prompt differences             | Show components, hook triggers, effective configuration, and changed pins                    |

Affected entry points: packages/contracts/src/index.ts, asset-modules.ts, harnesses.ts; apps/web/src/features/editor/CompositionEditor.tsx, modules/WorkflowModule.tsx, EditorPage.tsx; features/assets/AssetDetailPage.tsx, ComparePage.tsx; features/projects/ProjectExport.tsx; apps/api/src/modules/assets/asset.service.ts, native-export.service.ts; modules/projects/project-export.service.ts, project.service.ts; modules/community/community.service.ts. The service/repository layering remains intact.

## Hooks: make the trigger explicit

Pre and Post are helpful presentation groups, but a binding must identify **before/after what**. Preserve the original native event, matcher, payload, script, timeout unit, and scope. Do not rename a foreign event and assume equivalent behavior.

| Boundary                 | Proposed UI                                                | Native examples                                                                                                        | Delivery                                                        |
| ------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Tool call                | Pre hooks / Post hooks → Tool call                         | Claude and VS Code Local PreToolUse/PostToolUse; Gemini BeforeTool/AfterTool; Copilot CLI/cloud preToolUse/postToolUse | Supported command-hook subset through existing adapters         |
| Agent turn or completion | Show the precise native trigger                            | Gemini BeforeAgent/AfterAgent; Claude Stop/SubagentStop have different meanings                                        | Only advertise an event when the adapter supports it            |
| Session                  | Session hooks                                              | Profile-specific SessionStart/SessionEnd or camelCase counterparts                                                     | Keep separate from tool pre/post groups                         |
| Workflow or stage        | Before workflow, After workflow, Before stage, After stage | SkillShare runner callbacks, not vendor-native tool events                                                             | Later executor capability; unavailable in initial native export |

The source hook asset owns its events. Attaching it displays all of those events, including a module with both Pre and Post behavior. The first implementation does not filter out selected events behind the author's back: create an attributed variant for a smaller event set. This avoids copying one hook release into two lists and accidentally installing it twice.

Deterministic export order means deterministic file content. It does **not** guarantee sequential execution: Claude documents matching hooks running in parallel. Do not expose an ordering control as a promise that one runtime hook finishes before another. A future runner can define and record sequential stage callbacks separately. [Claude lifecycle and ordering](https://code.claude.com/docs/en/hooks).

Gemini tool events and turn events are different; AfterAgent can request another model response rather than indicate completion of an entire workflow. [Gemini hook reference](https://geminicli.com/docs/hooks/reference/).

Copilot CLI/cloud differ in supported events and environment. VS Code Local additionally has its own event payload and agent-specific scope. Retain separate profiles and capability gates. [Copilot hooks](https://docs.github.com/en/copilot/reference/hooks-reference), [VS Code hooks](https://code.visualstudio.com/docs/agent-customization/hooks).

## Proposed shared contract

Add a workflow-specific versioned payload, for example content.workflow. The approved interface is implemented as the strict V2 contract; the example below describes its structure:

```ts
type WorkflowComponent = {
  id: string; // stable within this workflow; not the asset's identity
  role: 'skill' | 'agent' | 'mcp' | 'settings' | 'hook';
  releaseId: string;
};

type WorkflowDefinitionV2 = {
  schemaVersion: 2;
  target: {
    harness: HarnessId;
    sessionTarget?: 'local' | 'copilot';
    runtimeRange?: string; // author declaration, not test evidence
  };
  components: WorkflowComponent[];
  stages: WorkflowStageV2[]; // empty for composition-only workflows
  resolutions: CompositionResolution[];
};

type WorkflowStageV2 = {
  id: string;
  name: string;
  componentId: string; // must resolve to a skill or agent component
  inputFrom: string[];
  output: string;
  approval: boolean;
  failure: 'pause' | 'stop' | 'retry';
  retries: number;
  timeoutSeconds: number;
};
```

Use strict, discriminated Zod contracts and bounded arrays. Component IDs must be unique, roles must match the referenced asset, stage references must exist, and input references must be earlier stages or input. Do not maintain an independent second copy in content.dependencies/modules/stages for a V2 workflow. A common release-reference extractor must serve publication, details, export, variants, proposals, and comparisons.

A release may appear in several stages through one component reference. Reject accidental duplicate components for the same release. Multiple versions of the same asset require an explicit conflict diagnostic; the same native destination cannot silently install two versions. Keep hook event inspection derived from the immutable hook release's native source.

Initially select one target profile per workflow. Projects can hold different workflows for different targets. Cross-profile adaptation creates a reviewed variant; it never translates native hooks silently. Nested workflows are deferred to keep recursive composition and invocation semantics manageable.

## Frontend experience

Creation sections: **Basics → Components → Hooks → Optional stages → Review & publish**. The builder gets the main editor space. Source/configuration preview can collapse. On mobile, use Build/Preview views.

1. Choose the destination project, workflow name, purpose, target harness, and session target when needed.
2. Components offers Skills, Agents, MCP, Settings, and Hooks. Each picker shows creator, exact release, profile, requirements, and the existing release selector. An incompatible item gives a specific reason and a variant path.
3. Selected component rows support remove, inspect, update release, and contribution order. Changes affect this workflow draft only. Existing agent-attached skills and configuration appear as inherited transitive references with attribution.
4. Hooks shows Pre, Post, and Other events, each labeled with its actual boundary/event and scope. A single module can appear in multiple groups for inspection while remaining one pinned component.
5. Optional stages creates an execution plan using the selected skill/agent components. Keep the stage list; defer a graph canvas. Label it configuration-only while execution is unavailable. A published composition without stages is valid.
6. Review shows the complete dependency tree, missing configuration, permissions requested by components, effective MCP/settings/hooks, file conflicts, and source attribution. Nothing is authorized by adding a reference.
7. Publishing freezes components and the reviewed composition choices. Use workflow offers an inspectable recipe and, where all required components are exportable, the native ZIP.

Workflow details should answer: What components are included? What do the Pre/Post hooks act on? What configuration will be installed? Is a stage plan included? Variants/compare should show added/removed components, changed exact releases, target changes, hook events/commands/matchers, settings differences, and changed stage mappings. General text diffs remain available.

## Scope and composition rules

Initial workflow-level configuration applies to the exported workspace. An MCP or settings module is not scoped to one stage merely because its row sits near that stage.

Preserve agent-owned native configuration already present in pinned source. Do not promote its inline hooks to workspace hooks, which would widen their trigger scope. Display the effective scopes and diagnose conflicting inherited and explicit module definitions. Agent-scoped injection from a new external module requires a tested adapter and is deferred.

Stage-specific settings/MCP isolation requires separate runtime environments or a proven agent-scoped adapter. A single shared settings.json cannot truthfully represent mutually exclusive settings for separate stages. Initial publication rejects unsupported scoped overrides rather than flattening them globally.

Reuse composeNativePackages for supported contributions: named MCP merges, settings conflicts with explicit resolutions, native hook contributions, safe paths, supporting scripts, fixed archive timestamps, and all release provenance. Native hook source stays authoritative. Unknown fields/comments are retained in source assets; generated shared files remain derived output.

## Backend and export scope

- Dispatch workflow publication to a dedicated validator. Composition-only workflows require a purpose, target, and at least one valid component. Prompt text is optional; stage output/mapping fields are validated only when stages are present. Config-only recipes must not need artificial skill instructions.
- Check every direct and transitive release for access, role, profile/session compatibility, licensing, source attribution, supported export capability, and self/cyclic references. Existing releases remain stable; changed pins require a new draft/release.
- Separate workflow identity/recipe from native files. Export walks components plus existing agent dependencies once per release. Workflows do not need a fake nativePackage entrypoint.
- Export a SkillShare manifest at .skillshare/workflows/<normalized-name>-<full-asset-UUID>.json plus the actual native component destinations and skillshare-lock.json. This manifest is a SkillShare convention, not a Claude/Gemini/Copilot workflow file. Record schema/adapter versions, exact releases, target, stages, choices, and attribution. Include deterministic manifest naming/collision rules.
- Extend project export preview and pinned-plan publication to resolve workflow roots. Preserve existing project manifest access and exact release rules. Review conflicts across workflows selected together.
- For workflows without a fully native component set, allow a recipe download with clear requirements; block a native ZIP that would omit required components. No partial configuration is labeled complete.
- Prefer the existing asset CRUD/release/variant/proposal API. Add owner-authorized workflow preview at POST /api/assets/workflows/preview (projectId + draft content) and exact-release recipe/native export endpoints. Do not add a separate workflow database ownership model.
- Keep all file/config inspection and composition pure. Native commands, MCP endpoints, and public asset scripts never execute in the API process.

## Compatibility and migration

Existing workflow content is stored as JSONB; no new asset-type table or type CHECK is needed. Introduce an additive workflow payload schema and a legacy reader. Legacy stages map to unique skill/agent components after authorized exact-release lookup. Repeated stage releases share a component.

Legacy workflows did not declare a harness. Do not assume Claude or rewrite snapshots. Reading remains supported; editing into V2 asks for an explicit target and reports incompatible/missing native packages. Saving the conversion requires the current draft revision. Publishing creates a new immutable release.

Keep old exports/readers available. New export lock/manifest versions must be declared. Variants and proposals use the same compatibility reader; acceptance cannot bypass workflow reference validation. Keep existing auth, email OTP, sharing, and role checks unchanged.

## Delivery sequence

| Slice                      | Deliverable                                                                                | Done when                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| 1. Contract and validation | V2 payload, reference extractor, legacy reader, target capabilities, publication rules     | Composition-only and staged recipes validate correctly; incompatible references fail |
| 2. Builder                 | Five component types, pinned versions, hook event groups, optional stages, review          | A user can compose, save, reload, and publish without fabricated prompt fields       |
| 3. Details and reuse       | Recipe overview, effective scope, component-aware compare/variant/proposals                | The user can explain what a workflow variant changed and inspect its exact pins      |
| 4. Export integration      | Workflow roots, transitive native composition, recipe/lock output, frozen project plans    | Deterministic reviewed archives include every required accessible release            |
| 5. Execution later         | Isolated runs, stage callbacks, approvals, credentials, budgets, failure/cleanup semantics | Supported runs have recorded evidence and explicit authorization                     |

Slices 1–4 are the scope of the workflow update. Slice 5 is a distinct execution project. Advanced canvas, nested workflows, arbitrary script plugins, cross-harness automatic conversion, and stage-level environment overrides are outside this update.

## Acceptance scenario and tests

Create a Gemini workflow → select a requirements agent and acceptance-criteria skill → add MCP and settings → add a hook module with BeforeTool and AfterTool → inspect precise triggers and effective .gemini/settings.json → optionally define two stages → publish privately → create a variant with another skill release → compare changes → export from an exact project manifest.

Acceptance checks:

- Composition-only workflows publish with no stages and no mandatory prompt text.
- All five component roles support exact release selection, attribution, save/reload, and variant comparison.
- MCP/settings/hooks cannot be chosen as executable stages.
- Pre/Post grouping preserves native events; a dual-event hook installs once.
- Shared configuration conflicts require explicit reviewed choices; file order does not claim runtime sequencing.
- Missing scripts, inaccessible releases, wrong roles, incompatible profiles/session targets, unsupported scope, self-reference, and invalid stage mappings produce actionable errors.
- Source releases and old workflow snapshots remain unchanged after migration/edit/variant/proposal.
- Native exports contain all transitive components and a deterministic recipe/lock; changing permissions invalidates previews/downloads.
- Keyboard, mobile layout, light/dark themes, save failures, and publish recovery retain the existing editor behavior.
- Structural validation and unexecuted configuration are labeled clearly; a live-run button appears only when execution actually exists.

Application validation after implementation: 105 unit/API tests and seven browser tests passed, with contracts/API/web typechecks and production builds. See the implementation document for coverage and build constraints. No vendor runtime tasks, native hook commands, or MCP connections were executed.
