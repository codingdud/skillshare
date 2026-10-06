# Asset modules and harness adapters — implementation plan

Status: implemented for the supported profile subset. See [implementation and validation](asset-modules-implementation.md) for delivered behavior, evidence, and runtime limits. The findings below describe the pre-change repository. Research checked 2026-10-02 using Context7 and official vendor documentation. Repository findings below are from direct file inspection. Documentation compatibility is not evidence of successful runtime execution.

## 1. Confirmed problem and scope

The project action in apps/web/src/features/projects/ProjectPage.tsx:88 goes directly to /create/skill?project=<id>. The empty-state action at line 156 does the same. There is no asset chooser. Agent and workflow creation already exist through the global Create menu and /create/:type routes; the project entry point fails to expose them.

EditorPage.tsx:33 defines one shared section list; line 40 defaults the route type to skill. Its large conditional form mixes lifecycle, skill editing, agent composition, and workflow editing. NativeFiles.tsx also restricts its type to skill | agent. packages/contracts/src/native.ts:21 has three coarse platform IDs. Its template factory at line 139 and validator at line 207 branch on platform/type; line 239 prohibits supporting files outside an asset directory.

Consequences: legitimate root MCP files, settings files, and project hook configuration cannot be represented correctly. The database CHECK and shared assetTypeSchema only allow skill, agent, workflow. Publication also requires instruction/output/requirement text for every asset. Native export requires identical platform IDs and treats any repeated destination file as a collision, so independent settings and MCP contributions cannot be combined.

Requested outcome: expose Agent independently from Skill, and make MCP, Hooks, and Settings independently editable, versioned modules with harness-specific configuration.

## 2. Research findings that constrain the design

These are project/workspace destinations. User-level installation is a separate export scope, never an instruction to write into a visitor's home directory.

| Profile             | Skill                          | Agent                          | MCP                                                            | Hooks / settings                                                   |
| ------------------- | ------------------------------ | ------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------ |
| Claude Code         | .claude/skills/<name>/SKILL.md | .claude/agents/<name>.md       | project-root .mcp.json, mcpServers map                         | .claude/settings.json; hooks field                                 |
| Gemini CLI          | .gemini/skills/<name>/SKILL.md | .gemini/agents/<name>.md       | .gemini/settings.json, mcpServers map                          | same settings file; hooks field                                    |
| Copilot in VS Code  | .github/skills/<name>/SKILL.md | .github/agents/<name>.agent.md | portable .mcp.json; existing .vscode/mcp.json uses servers     | .github/hooks/*.json; settings depend on session target            |
| Copilot CLI         | .github/skills/<name>/SKILL.md | .github/agents/ definitions    | .mcp.json or .github/mcp.json; user ~/.copilot/mcp-config.json | .github/hooks/*.json; CLI-specific settings                        |
| Copilot cloud agent | .github/skills/<name>/SKILL.md | .github/agents/ definitions    | repository configuration or agent mcp-servers frontmatter      | .github/hooks/*.json; cloud-supported events and shell fields only |

Claude's agent fields include tools, disallowedTools, model, permissionMode, skills, mcpServers, and hooks. Plugin agent scope differs: some agent-local fields are ignored there. Keep plugin packaging distinct from project files. [Claude subagents](https://code.claude.com/docs/en/sub-agents), [Claude skills](https://code.claude.com/docs/en/skills), [Claude MCP](https://code.claude.com/docs/en/mcp).

Claude shared settings use .claude/settings.json; settings.local.json is a personal override. Hook definitions can live in settings or plugin hook files. Do not export personal permission approvals or authentication state as team settings. [Settings scope](https://code.claude.com/docs/en/settings), [Hooks reference](https://code.claude.com/docs/en/hooks).

Gemini local agents expose kind, tools, model, temperature, max_turns, timeout_mins, and agent-local mcpServers. The current docs state that subagents cannot invoke other subagents, even with wildcard tools. Keep distribution dependencies separate from supported delegation. Workspace skills also have an .agents/skills alias. [Gemini subagents](https://geminicli.com/docs/core/subagents/), [Gemini skills](https://geminicli.com/docs/cli/skills/).

Gemini project MCP and hooks share settings.json. BeforeTool/AfterTool use Gemini tool names and matcher rules. The reference defines hook timeout in milliseconds. An extension uses gemini-extension.json and extension-root component directories, rather than a project .gemini directory. [Gemini MCP](https://geminicli.com/docs/tools/mcp-server/), [Gemini hooks](https://geminicli.com/docs/hooks/reference/), [Gemini configuration](https://geminicli.com/docs/reference/configuration/), [Gemini extension packaging](https://geminicli.com/docs/extensions/reference/).

VS Code agent definitions support tools, agents, handoffs, model, and invocation controls. Selecting an agents allowlist requires the agent tool. The current VS Code docs recommend portable MCP destinations for new configuration while retaining the older servers-based .vscode/mcp.json format. Hooks and agent-local hooks depend on the selected VS Code session harness; their presence does not establish universal Copilot support. [VS Code agents](https://code.visualstudio.com/docs/agent-customization/custom-agents), [VS Code MCP](https://code.visualstudio.com/docs/agent-customization/mcp-servers), [VS Code hooks](https://code.visualstudio.com/docs/agent-customization/hooks).

Copilot CLI accepts project MCP files separately from user configuration. Current GitHub documentation distinguishes native camelCase hook events and compatible PascalCase events with different payloads. Hook format, payload, timeout, shell selection, and supported event set require a profile, not a casing conversion. Cloud ignores IDE handoffs and does not use the same inline MCP configuration as VS Code. [CLI MCP](https://docs.github.com/en/enterprise-cloud%40latest/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers), [Copilot hooks](https://docs.github.com/en/copilot/reference/hooks-reference), [Cloud agent fields](https://docs.github.com/en/copilot/reference/custom-agents-configuration).

SKILL.md and supporting resources have a common specification, but harness extensions and permissive defaults still differ. Use a portable-spec validation mode separately from a native-harness mode; do not impose one platform's requirements on every imported file. [Agent Skills specification](https://agentskills.io/specification), [Copilot skills](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills).

## 3. Recommended product model

Keep Project → independently owned/versioned assets → exact project releases. Extend asset kinds to skill, agent, workflow, mcp, hook, settings. The UI labels are Skill, Agent, Workflow, MCP server, Hooks, and Harness settings. MCP server here means a reusable connection definition; implementing/hosting an MCP server is a separate capability.

Separate kind from harness profile. A skill stays a skill whether its target is Claude or Gemini. A harness adapter knows its native paths and supported fields; it must not decide ownership, attribution, or publication permissions.

Each native asset initially targets one explicit profile. A project may contain assets for several profiles. Export selects a profile and explicit modules; unsupported required references block export with a resolution. Cross-harness conversion creates a reviewed draft/variant and reports fields that cannot be translated.

The initial profile IDs should distinguish claude-code, gemini-cli, copilot-vscode, copilot-cli, and copilot-cloud. VS Code records its session target (Local versus Copilot/Agent Host) as part of compatibility. Store the adapter schema version and declared runtime range; runtime testing records the exact installed version and environment. Do not invent minimum versions from unversioned documentation.

Use common metadata for name, purpose, tags, license, examples where relevant, and attribution. Use separate payload schemas: skill instructions/resources; agent configuration and skill/tool/delegation references; workflow stages; MCP transport/configuration; hook events/scripts; settings values and scope. Settings and MCP assets should not need artificial prompt text or expected-output fields to publish.

## 4. Creation and editing experience

1. Project Add asset opens a chooser with all supported kinds, preserving project ID. The empty state offers the same chooser instead of Create skill.
2. Choosing Agent opens the agent form; choosing Skill opens the skill form. Global Create uses the same registry and destinations.
3. Choose a supported harness/profile and scope before generating files. Workflow keeps SkillShare's workflow format and explicitly references compatible releases.
4. Use a shared editor shell for lifecycle, save status, conflict recovery, attribution, examples, preview, and publication. Kind modules supply their own sections.
5. Agent sections: Goal & instructions, Skills, Tools & MCP, Delegation, Native files, Examples, Publish. Show whether delegation is supported for the selected profile.
6. Skill sections: Instructions & resources, Inputs/output, Native files, Examples, Publish. MCP: Transport, Connection, Tool exposure, Credential requirements, Native config. Hooks: Events, Matchers, Commands/scripts, Native config. Settings: Scope, Categories, Native config.
7. Keep the full-width file explorer, source highlighting, folder actions, per-file reset, and change proposals. Provide Form / Files views with one source of truth.
8. Project views expose a kind filter, module dependencies, target profile, and an export preview. Unsupported actions remain unavailable with a specific explanation.

Do not put every settings field into one universal form. An adapter publishes its supported controls, descriptions, documentation links, defaults, and diagnostics. An advanced native editor preserves unrecognized fields instead of silently deleting them.

## 5. Extensible interfaces and folder boundaries

Two registries are needed: an asset module registry and a harness adapter registry. The following is a conceptual TypeScript contract, not completed implementation:

```ts
interface AssetModule<TPayload> {
  kind: AssetKind;
  label: string;
  schemaVersion: number;
  validateDraft(input: unknown): DraftDiagnostics;
  validatePublication(payload: TPayload, context: ReleaseContext): Diagnostic[];
  dependencies(payload: TPayload): ReleaseReference[];
}

interface HarnessAdapter {
  id: HarnessId;
  schemaVersion: number;
  capabilities(target: HarnessTarget): CapabilityMatrix;
  createTemplate(kind: AssetKind, target: HarnessTarget): NativeFiles;
  inspect(files: NativeFiles, target: HarnessTarget): Diagnostic[];
  contributions(module: NativeModule, target: HarnessTarget): FileContribution[];
  compose(parts: FileContribution[], target: HarnessTarget): ExportPlan;
}
```

Shared contracts contain discriminated Zod unions, diagnostics, reference types, capabilities, and pure adapters. A discriminant selects the payload schema; avoid a catch-all untyped object. Frontend descriptors separately register icons, section components, default values, and labels. React imports do not enter the contracts package. Backend validators never trust frontend availability checks.

Proposed organization:

```text
packages/contracts/src/
  assets/common.ts, schemas.ts, references.ts
  modules/skill.ts, agent.ts, workflow.ts, mcp.ts, hook.ts, settings.ts
  harnesses/types.ts, registry.ts
  harnesses/claude-code/, gemini-cli/, copilot-vscode/, copilot-cli/, copilot-cloud/
apps/web/src/features/assets/create/AssetKindPicker.tsx
apps/web/src/features/editor/
  EditorShell.tsx, editor-registry.ts
  modules/skill/, agent/, workflow/, mcp/, hook/, settings/
  files/  # reusable explorer, source editor, file operations
apps/api/src/modules/assets/
  existing route/controller/service/repository boundary
  validation.service.ts, composition.service.ts, native-export.service.ts
```

Adding a supported harness should require an adapter, explicit registration, and fixtures. Adding an asset kind requires its contract, UI descriptor, validator, API/search coverage, and database constraint migration. A registry cannot eliminate those necessary integration changes. Avoid loading arbitrary executable plugins from public assets into the application server.

## 6. Native source and composition rules

Preserve raw native files as the authority for native configuration. Forms derive a projection; patches change only the fields edited and preserve unrelated fields/comments when the format supports them. Syntax errors keep the source draft intact and disable the affected form section. Never save two independent copies of instructions/configuration that can disagree.

An exported project has one composed file for shared destinations such as .gemini/settings.json, .claude/settings.json, or .mcp.json. Independently versioned modules contribute owned JSON paths, such as /mcpServers/issues or /hooks/BeforeTool. A settings module may own other paths but cannot silently replace contributions from a pinned MCP/hook module.

Merge behavior is adapter-defined: distinct server names combine; incompatible definitions for the same server name produce a conflict. Identical definitions may deduplicate only with both source releases retained in provenance. Hook ordering is explicit and deterministic; timeout units and payload contracts stay native. Conflicting settings values require a saved resolution; no last-writer-wins. Arbitrary text-file collisions remain errors.

Show the final files, semantic changes, and contributor/release attribution before exporting. skillshare-lock.json records exact selected releases, adapter version, profile, and composition choices. A project release pins those choices so repeating export does not depend on the newest adapter defaults.

Skill references remain in their skill folder. Agent discovery folders should contain agent definitions. Supporting Markdown under an agents directory can be mistaken for another definition by recursive discovery. Propose an asset-owned resources directory outside agent discovery paths, with relative links; explicitly label this as a SkillShare packaging convention, not a vendor-defined resources format. Preserve existing releases and require a reviewed new draft for relocation.

## 7. Backend and compatibility migration

- Expand asset kind validation and the PostgreSQL CHECK in a versioned, idempotent migration. Add typed payload/schema version while keeping existing JSONB snapshots readable.
- Keep legacy platform IDs readable. Map claude → claude-code, gemini → gemini-cli, copilot → copilot-vscode in a compatibility reader; do not rewrite published releases or silently retarget Copilot assets.
- Preserve existing skill/agent/workflow payloads and exact releases. Editing into the new format is explicit and revision checked.
- Dispatch publish validation by asset kind and profile. Incomplete drafts remain recoverable; malformed native configuration blocks publication/export. MCP, hooks, and settings use relevant validation rather than the current mandatory instruction/output check.
- Generalize pinned references to { role, releaseId }; roles distinguish skill, subagent distribution, MCP, hook, and settings. Native runtime names are resolved from pinned definitions. A pinned subagent dependency does not promise that the harness permits nested invocation.
- Proposed endpoints: GET /api/harnesses for the trusted capability registry; POST /api/assets/validate for draft diagnostics; POST /api/projects/:id/export/preview for composition/conflicts; export resolves an immutable project release plus explicit target. Retain existing asset CRUD/release endpoints.
- Apply ownership/access checks to every module and transitive reference, including validation/export previews. Private dependencies cannot appear usable inside a public release. Extend search, workspace type filters, badges, variants, comparison, and contribution validation for new kinds.
- Credentials stay in the installation environment. Export named requirements/placeholders according to the selected profile, never personal tokens, approvals, or session state. Import, validation, publication, and ZIP export do not execute commands, hooks, or connect to MCP endpoints.

## 8. Validation gates and acceptance criteria

### Research gate — completed

Confirmed the project routing defect and current form/schema/export constraints. Compared official paths, scope, hook syntax, MCP container keys, delegation behavior, and Copilot profile differences. Recorded links and research date. Runtime versions remain to be checked during implementation.

### Contract and adapter gate — planned

Add versioned fixtures from official examples for every supported profile/kind. Test correct defaults and required fields, invalid YAML/JSON/JSONC, retained unknown fields, unsupported capabilities, timeout units, and script/reference resolution. Portable skill checks and native harness checks must be distinct.

Test that Gemini nested delegation is rejected/reported, Copilot cloud handoffs are flagged as unsupported, and VS Code MCP roots are not interpreted as Claude/Gemini roots. Retain legacy package fixtures. A complete export must pass its own target validator.

### Composition and lifecycle gate — planned

Test MCP/settings/hook contributions sharing one settings file; collisions with explicit resolutions; deterministic bytes/provenance; case-conflicting paths; missing scripts; safe path boundaries; changed dependency access; private/public publication; draft conflicts; immutable releases; and old exports. Demonstrate that importing/publishing/exporting never runs supplied scripts or contacts servers.

### UI gate — planned

From a project, create and save Skill, Agent, Workflow, MCP, Hooks, and Settings independently. Confirm project context and type survive navigation/reload. A settings/MCP form contains no required skill prompt fields. Check form/source synchronization, full-width file editing, keyboard chooser, dark/light themes, mobile layout, save failure recovery, and change proposal diffs.

### Runtime evidence gate — planned

After structural checks, validate exported examples in clean environments with recorded versions of Claude Code, Gemini CLI, and selected Copilot surfaces. First confirm asset discovery and config parsing. Only test MCP connections or hook execution in an explicit controlled test environment; label unavailable/unexecuted checks accordingly. Record OS, profile/session target, CLI/IDE version, fixture hash, and observed behavior. Documentation checked, structurally valid, and runtime tested are separate signals.

## 9. Delivery order

1. Replace project skill-only links with a registry-driven chooser; route Agent/Skill/Workflow correctly. Add targeted regression coverage.
2. Extract EditorShell and separate existing kind modules without changing legacy content or lifecycle behavior.
3. Introduce discriminated module contracts and harness capability adapters; maintain legacy readers and immutable releases.
4. Add MCP, Hooks, and Settings forms plus the additive database/API/search changes.
5. Add profile-aware project composition, conflict review, release pinning, and export preview.
6. Run the acceptance gates and document exact runtime compatibility. Plugin/extension bundle exporters can follow through a distinct export mode.

This is the approved research plan. The application refactor and additive migrations are now implemented; runtime execution remains a separate validation gate. See the implementation reference for the delivered subset.
