# Asset modules: implementation and validation

Updated 2026-10-02. This describes the implementation of the [researched plan](asset-modules-plan.md).

## Creating and adapting assets

Project **Add asset** opens a chooser for Skill, Agent, Workflow, MCP server, Hooks, and Harness settings. The project stays selected. Global Create uses the same kind definitions. Editors share lifecycle controls and have separate modules and relevant sections. Switching kinds initializes a new editor rather than retaining another kind’s draft.

Skills edit instructions and resources. Agents additionally configure tools, model, native delegation fields, and pinned skill/subagent/configuration releases. Workflow stages accept skills or agents. Configuration assets edit native JSON/JSONC without artificial skill prompt/output fields. MCP controls edit commands, arguments, endpoints, and named servers. Hooks expose native commands, matchers, and timeout values. Settings controls edit primitive values; structured and advanced configuration remains editable in Files.

Files remain the source of truth. Form changes patch existing source while retaining comments and unrelated properties. Invalid drafts remain editable; publication/export rejects invalid supported configuration. Monaco highlights Markdown/frontmatter, JSON/JSONC, and supporting code. The file explorer, undo, source reset, and change proposals remain available. New agent resources are stored outside discovered agents folders; this is a SkillShare packaging convention. Existing release paths are retained.

## Supported adapters

| Profile                | Skills/agents                             | MCP                                                          | Hooks                                                | Settings                             |
| ---------------------- | ----------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------- | ------------------------------------ |
| Claude Code            | .claude/skills, .claude/agents            | .mcp.json / mcpServers                                       | .claude/settings.json                                | .claude/settings.json                |
| Gemini CLI             | .gemini/skills, .gemini/agents            | .gemini/settings.json / mcpServers                           | same settings file, millisecond timeouts             | same settings file                   |
| Copilot VS Code, Local | .github/skills, .github/agents/*.agent.md | portable .mcp.json; legacy .vscode/mcp.json / servers        | .github/hooks/*.json, Local events                   | .vscode/settings.json                |
| Copilot CLI            | .github/skills, .github/agents/*.agent.md | .mcp.json; .github/mcp.json reader                           | .github/hooks/*.json, version 1                      | standalone settings adapter deferred |
| Copilot cloud          | .github/skills, .github/agents/*.agent.md | agent/repository configuration; standalone exporter deferred | .github/hooks/*.json, cloud event/shell restrictions | standalone settings adapter deferred |

VS Code hooks explicitly target Local sessions; Copilot/Agent Host payload support is separate and is not inferred from Local configuration. The Copilot CLI adapter uses native command hooks. Other hook types and runtime-specific compatibility formats require additional adapters. Unknown settings/frontmatter fields are retained; checks cover the supported subset, not complete vendor schemas. Per-kind Format reference links point to vendor documentation.

The native package records schemaVersion, platform, optional sessionTarget, optional author-declared runtimeRange, entrypoint, files, and folders. New assets carry a discriminated kind/schema descriptor. Legacy content and the claude/copilot/gemini IDs remain readable. Published snapshots are not rewritten.

## Composition and publication

Agents pin configuration modules with typed role/release references. The API checks every role, ownership, visibility, and compatible harness. Gemini nested subagent calls are blocked. Dependency rows display the creator and exact version; the release picker supports older releases. Pinning files does not grant runtime permissions.

Project Export selects an immutable manifest, target, explicit releases, and contribution order. It follows pinned dependencies and rechecks access. Named MCP servers merge; different definitions for the same name require an explicit choice. Hook contributions retain deterministic ordering. Settings conflicts require explicit choices. Arbitrary text-file collisions remain errors.

Review generated files and diagnostics before download. A reviewed plan can be included when publishing a new project release. That release pins adapter version 1, target, selected release order, and conflict choices. Changing pinned choices requires a new release. The ZIP includes source attribution, licenses, author declarations, exact versions, and choices in skillshare-lock.json. Archive timestamps are fixed for reproducible output. Existing local files are not inspected or overwritten by export.

## API and migration

- GET /api/harnesses and /api/assets/harnesses: capability registry.
- POST /api/assets/validate: owner-authorized native draft diagnostics.
- GET /api/assets/releases/:releaseId: authorized version/name/type/creator lookup.
- Existing asset CRUD, release, variant, review, save, and proposal routes support all six kinds.
- POST /api/projects/:id/export/preview and /export: exact-manifest composition and ZIP.
- Project publication accepts an optional reviewed exportPlan and rejects plans that no longer match current releases.

001-asset-modules expands the PostgreSQL type CHECK. 002-project-export-plan adds optional export_plan to project releases. The migration runner records applied IDs and is idempotent. Both were applied to the local PostgreSQL database; no existing release contents were rewritten.

## Validation evidence

**Final application checks after the workflow update:** 105 unit/API tests passed, all seven browser tests passed, and contracts/API/web TypeScript checks passed. Production frontend/API bundles built successfully; a fresh built API returned HTTP 200 from health and the registry (five harness profiles).

The automated suites cover existing auth/session/OTP flows, source attribution, draft revisions, access filtering, all native templates, JSONC/YAML preservation, missing scripts, unsafe paths, role errors, shared-file merging, conflict choices, immutability, and reproducible archives. Browser coverage creates all six kinds, reloads drafts, publishes configuration, composes Gemini native files, downloads the ZIP, and pins a new manifest. It also checks the existing public/creator/file-editor journeys, mobile overflow, and theme switching.

Structural and application checks are distinct from execution evidence. Claude Code 2.1.251 is installed; only its version was read. Gemini CLI and Copilot CLI were not found on PATH. No model tasks, hook commands, or MCP connections were executed. No runtime compatibility badge is granted.

The production frontend and backend are built and typechecked. The backend bundle is also smoke-tested through health and harness-registry endpoints in a fresh process. In this managed environment, esbuild’s default parent-directory discovery is restricted; backend build verification uses the same tsup options with a workspace-confined resolver. Normal npm build scripts remain unchanged.

## Official references

- [Claude skills](https://code.claude.com/docs/en/skills), [agents](https://code.claude.com/docs/en/sub-agents), [MCP](https://code.claude.com/docs/en/mcp), [hooks](https://code.claude.com/docs/en/hooks), [settings](https://code.claude.com/docs/en/settings).
- [Gemini agents](https://geminicli.com/docs/core/subagents/), [MCP](https://geminicli.com/docs/tools/mcp-server/), [hooks](https://geminicli.com/docs/hooks/reference/), [configuration](https://geminicli.com/docs/reference/configuration/).
- [VS Code agents](https://code.visualstudio.com/docs/agent-customization/custom-agents), [MCP](https://code.visualstudio.com/docs/agent-customization/mcp-servers), [Local hooks](https://code.visualstudio.com/docs/agent-customization/hooks).
- [Copilot hook formats](https://docs.github.com/en/copilot/reference/hooks-reference), [cloud agent configuration](https://docs.github.com/en/copilot/reference/custom-agents-configuration).

## Delivered workflow update

New creation uses the [project-first file editor and optional project workflow builder](project-first-creation.md). The workflow composer accepts skills, agents, MCP, settings, and native pre/post hooks as pinned components, with optional skill/agent stages. See [workflow-composition-implementation.md](workflow-composition-implementation.md) for usage, legacy conversion, export formats, and validation. The approved [scope](workflow-composition-scope.md) records the research. Hook contribution ordering refers to generated file content; actual runtime sequencing is determined by each harness.
