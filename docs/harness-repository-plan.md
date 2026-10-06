# Harness repository redesign plan

Status: Harness-only application delivered. Standalone project/asset routes and handlers are removed; native data is preserved in Harness drafts and historical storage is archived. See [Harness-only retirement](harness-only.md) for the current implementation. The compatibility and migration proposals below describe the earlier transition plan.

Prepared against the current code and official runtime documentation on 2026-10-02. This supersedes the creation model in [project-first-creation.md](project-first-creation.md).

## 1. What the developer should experience

A developer can share one agent file or an entire native configuration folder without registering each contained agent, skill, hook, or MCP server separately.

**Harness is the repository of files that the developer maintains and shares.** The files are authoritative. Recognized agents, skills, hooks, settings, instructions, and MCP configurations are an automatically derived view of those files.

There is one repository explorer, one Monaco workspace with file tabs, one draft, and one publication flow. Creating a new file does not create a separate required asset record or release.

Example journey:

```text
New Harness
  → upload a file, folder, or ZIP, or start with native files
  → review preserved paths and detected runtime profiles
  → edit any file in the same Monaco workspace
  → review file changes and runtime diagnostics
  → publish one Harness release
  → share, download, fork, or propose changes
```

Uploading is an import into SkillShare. Connecting a Git remote and pushing a branch is a separate integration; these actions must not be given the same misleading button label.

## 2. Remove the present redundancy

The current project editor selects a typed component before opening its native package. Add component still requires type, runtime, name, and purpose; components have their own publication step. Moving these forms inside a project did not remove the underlying duplication.

| Current model                                      | Proposed model                                                                   |
| -------------------------------------------------- | -------------------------------------------------------------------------------- |
| Create project                                     | New Harness                                                                      |
| My projects                                        | My harnesses                                                                     |
| Select component, then its files                   | Open any repository path directly                                                |
| Add skill / agent / MCP / hook / settings form     | New file, New folder, Import, or optional native template                        |
| Separate editable discovery metadata for each file | Parse names and descriptions from native files; show optional derived inspection |
| Publish components, then publish project           | Publish the saved repository snapshot once                                       |
| Workflow as another required asset                 | Optional assembly tool that writes files into a Harness draft                    |
| Export reconstructed component packages            | Download original repository paths and contents                                  |

Keep Explore, Saved, Activity, Organizations, reviews, attribution, and private/team/public access. Discovery can still find an agent or skill, but its result opens its file in the owning Harness at the indexed release. It does not require a separate creation form.

Use **Harness** for the shared repository and **Runtime profile** for Claude Code, Gemini CLI, Copilot VS Code, Copilot CLI, or Copilot cloud. Internally rename the existing runtime `HarnessId` concept to `RuntimeProfileId` to avoid mixing it with the new repository identity.

## 3. Native layouts and research findings

A Harness may contain one profile or several. Native formats and capabilities remain distinct; the editor preserves them rather than converting everything into a universal schema.

| Runtime            | Representative repository files                                                                                                                  | Validation approach                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Claude Code        | `.claude/agents/*.md`, `.claude/skills/<name>/SKILL.md`, `.claude/settings.json`, root `CLAUDE.md` and `.mcp.json`                               | Agent and skill frontmatter have different fields; settings can contain permissions and hooks |
| Gemini CLI         | `.gemini/agents/*.md`, `.gemini/skills/<name>/SKILL.md`, `.gemini/settings.json`, root `GEMINI.md`                                               | Parse Gemini agent fields; inspect settings for hooks and `mcpServers`                        |
| Copilot            | `.github/agents/*.agent.md`, `.github/skills/<name>/SKILL.md`, `.github/copilot-instructions.md`; CLI hook definitions in `.github/hooks/*.json` | Apply the selected Copilot environment's capabilities, not a generic Copilot validator        |
| Copilot in VS Code | Workspace settings and MCP configuration may live outside `.github`, including `.vscode/settings.json`, `.vscode/mcp.json`, and root `.mcp.json` | Distinguish the `servers` workspace format from portable `mcpServers` configuration           |

Claude's locations and distinction between project configuration and personal application data are documented in its [directory reference](https://code.claude.com/docs/en/claude-directory). Gemini documents [agent definitions](https://geminicli.com/docs/core/subagents/), [skills](https://geminicli.com/docs/cli/skills/), [project configuration](https://geminicli.com/docs/reference/configuration/), and [MCP settings](https://geminicli.com/docs/tools/mcp-server/).

Copilot documents [agent configuration and environment differences](https://docs.github.com/en/copilot/reference/custom-agents-configuration), [VS Code custom agents](https://code.visualstudio.com/docs/agent-customization/custom-agents), [skill discovery](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills), and [CLI hooks](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks). Copilot can also discover project skills in `.claude/skills` or `.agents/skills`; a folder name alone is not proof of an exclusive target runtime.

The current [VS Code MCP documentation](https://code.visualstudio.com/docs/agent-customization/mcp-servers) supports both `.vscode/mcp.json` and portable root `.mcp.json`, while recommending portable destinations for new servers. Preserve existing configurations; do not rewrite one format as the other on import.

These are supported examples, not an exhaustive fixed whitelist. Preserve additional rules, references, scripts, prompts, commands, and unfamiliar text files. Mark unrecognized files as ordinary files. Runtime adapters should record their documentation/schema revision and expose experimental or version-dependent capabilities explicitly.

Example repository; folders are optional, and a single agent file is sufficient to start:

```text
delivery-harness/
├── README.md
├── LICENSE
├── CLAUDE.md
├── GEMINI.md
├── .mcp.json
├── .claude/
│   ├── agents/reviewer.md
│   ├── skills/acceptance-criteria/
│   │   ├── SKILL.md
│   │   └── references/checklist.md
│   ├── hooks/check-output.sh
│   └── settings.json
├── .github/
│   ├── agents/reviewer.agent.md
│   ├── skills/test-plan/SKILL.md
│   ├── hooks/review.json
│   └── copilot-instructions.md
├── .gemini/
│   ├── agents/reviewer.md
│   ├── skills/test-plan/SKILL.md
│   └── settings.json
└── .vscode/
    ├── settings.json
    └── mcp.json
```

## 4. Creation and import

New Harness asks only for repository name, destination workspace, and initial visibility. Description and reuse terms belong to the Harness overview/publication review. It accepts a blank repository, an optional runtime template, or an import.

- **Single file:** preserve its existing path when supplied. A bare `reviewer.md` upload has no parent directory metadata, so show a suggested destination and ask for a path/profile only when ambiguous. Do not invent sibling files or resources.
- **Folder:** preserve relative paths, including hidden configuration directories. Preview whether the uploaded directory itself is the runtime folder or is a wrapper containing it. Make root stripping explicit so `.claude` never silently becomes `agents/` at the repository root.
- **ZIP:** preview the same tree, exclusions, size limits, and path collisions before applying an atomic import.
- **Existing Harness:** import selected files into its draft with a changes preview; conflicting paths require Keep existing, Replace, or Rename. Never overwrite a published release.
- **Git repository:** add later as a connected source with exact repository, branch, commit, and selected paths. Import initially; bidirectional synchronization is separate work.

Detected profiles are suggestions. A multi-profile repository can keep all its files and choose intended runtime profiles. `.github` alone cannot distinguish VS Code, CLI, and cloud support. No required single `platform` or package `entrypoint` should gate repository creation.

Draft saving must preserve incomplete Markdown/frontmatter/JSON while the developer edits. Syntax problems appear in Problems and publication review; a failed parse must not discard or block saving raw content. Publishing supported configurations requires resolution of blocking diagnostics for the declared profiles. Generic files are retained without pretending they are validated runtime assets.

## 5. One editor workspace

Harness navigation: **Overview · Files · Changes · Releases · Reviews**. Access/settings stay secondary. Files opens the same repository whether the user arrives from Explore, a saved item, or an agent/skill search result.

Desktop workspace:

```text
Harness name · workspace · draft/release · Saved/Unsaved/Error   Review & publish
┌───────────────────────┬───────────────────────────────────────────────────┐
│ Repository explorer   │ File tabs and path breadcrumb                    │
│ New file / folder     │                                                   │
│ Import / collapse     │ Monaco editor, or source comparison              │
│                       │                                                   │
│ .claude               │                                                   │
│ .github               │                                                   │
│ .gemini               ├───────────────────────────────────────────────────┤
│ root files            │ Problems / changes / optional file inspector     │
└───────────────────────┴───────────────────────────────────────────────────┘
```

- Monaco takes the available height and width. The global sidebar collapses to icons; the file explorer can collapse independently. No component details form occupies the editing canvas.
- The explorer has clickable folders, file tabs, keyboard navigation, right-click and toolbar create/rename/move/delete actions, and undo for draft deletion.
- File selection, open tabs, cursor/scroll position, editor undo state, and unsaved contents survive navigation between files. Bind document state to stable file IDs; paths can change after a rename.
- Highlight Markdown with YAML frontmatter, JSON/JSONC where supported, YAML, and hook/script languages. Use profile-specific diagnostics with file and line links. Highlighting alone is not validation.
- A read-only inspector may summarize allowed tools, subagent references, MCP requirements, and hook events from the selected file. Raw content remains authoritative; editing a summary must be an explicit previewed source edit.
- Rename/move previews known affected references. Offer explicit reference updates; never claim free-form prompt references or shell commands can all be rewritten safely.
- Changes shows added, modified, removed, and renamed paths and source diffs. Forks additionally show their exact source release and a plain-language summary of changed behavior and requirements.
- Mobile uses a drawer/tree and the same file editor, with stacked diffs. Preserve dark mode, visible focus, keyboard actions, and permission-aware controls.
- Published releases open read-only. Edit opens a new draft; permitted contributors can propose a multi-file change against an exact base snapshot. Logged-out viewers see browse/download/sign-in actions rather than unusable edit controls.

## 6. Backend and data model

Retain the TypeScript modular layered backend, PostgreSQL, existing auth/OTP/session flow, Redux state organization, Axios refresh queue, Zod contracts, and shared Monaco UI. This is a domain/storage redesign, not a framework rewrite.

Suggested boundaries:

```text
modules/harnesses/      routes → controller → service → repository
modules/repositories/  file trees, blobs, revisions, atomic changesets
modules/runtime-profiles/ detection, parsers, diagnostics, native templates
modules/imports/       import preview, bounded extraction, collision review
modules/discovery/     derived catalog and permission-filtered indexing
modules/contributions/ multi-file proposals, comparison, merge review
modules/git-sync/      optional remote integration and workers, later
```

| Entity                   | Responsibility                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| Harness                  | Stable ID, owner/workspace, slug, visibility, description, reuse terms, source attribution           |
| Repository file identity | Stable file ID within a Harness; survives explicit rename/move                                       |
| Content blob             | Immutable bytes/content hash, encoding, size; attachments can use object storage                     |
| Repository revision      | Immutable tree of paths, file IDs, blobs and supported file modes; parent/base revisions and author  |
| Harness draft            | Points to the current saved revision with an optimistic concurrency token                            |
| Harness release          | Immutable named snapshot pointing to one repository revision, release notes and declared profiles    |
| Derived catalog entry    | Classification/name/capabilities for a file or skill directory at a revision; rebuildable from files |
| Provenance               | Source Harness/release, source paths or legacy asset/release IDs and applicable reuse terms          |
| Change proposal          | Base revision, proposed multi-file changes, reviews and resolution status                            |
| Optional Git connection  | Remote repository and scoped credential reference; never credentials embedded in files               |

A revision is an application snapshot; do not claim it is a Git commit. Explicit folders may be retained in drafts, while exports should document Git's inability to track empty directories. Preserve executable mode metadata for imported hook scripts where available; a browser file upload may not supply it.

Suggested new API contract, subject to implementation review:

| Endpoint                                            | Purpose                                                    |
| --------------------------------------------------- | ---------------------------------------------------------- |
| `POST /api/harnesses`                               | Create repository metadata and initial draft               |
| `GET /api/harnesses/:id/tree?revision=...`          | Authorized draft or immutable tree                         |
| `GET /api/harnesses/:id/files/:fileId?revision=...` | Read exact file contents                                   |
| `POST /api/harnesses/:id/imports/preview`           | Bounded import preview, inferred profiles, collisions      |
| `POST /api/harnesses/:id/changesets`                | Atomic create/edit/rename/delete/import with base revision |
| `GET /api/harnesses/:id/compare?base=...&head=...`  | Authorized repository diff                                 |
| `POST /api/harnesses/:id/releases`                  | Validate and publish exact saved revision                  |
| `GET /api/harnesses/:id/releases/:releaseId/export` | Download original native paths at that snapshot            |
| `POST /api/harnesses/:id/forks`                     | Attributed independent copy of an accessible release       |

Keep route compatibility during migration; introduce Harness terminology without immediately deleting existing project endpoints.

Every write validates membership/capability in the service and expected draft revision in the transaction. Conflicts return the current revision and useful diff context; the frontend retains local edits for compare/rebase/retry. Use mutation IDs so retrying an import or publish does not duplicate the operation. Publish compares the requested revision with saved state and snapshots all files atomically.

Separate raw persistence validation from runtime validation. Reject traversal, absolute paths, symlink extraction, duplicate/case-colliding paths, file/directory collisions, and bounded-archive violations. Support ordinary filenames with spaces/Unicode rather than carrying forward the current ASCII-only path rule. Review import exclusions and credentials before public publication; never upload `.git` internals or personal runtime auth/cache files as configuration. Imported scripts and MCP definitions are stored and inspected, not executed by the API.

The existing per-component limit of 64 files/500 KB is not a repository limit. Set configurable file, byte, archive-expansion, and attachment limits based on representative Harness imports; return actionable errors. First delivery should guarantee lossless supported text-file round trips and explicitly report unsupported binary files rather than silently dropping them.

Derived discovery indexes only permitted released content by default. Recheck authorization for results, snippets, facets, previews, exports, and source comparisons. Updating visibility immediately restricts access and invalidates cached access even if background indexing has not completed. Publish a revision and an indexing event atomically; derived parsing/indexing failures can retry without changing release bytes.

## 7. Workflow and reuse

Keep custom workflow assembly as an optional **Build from existing files/components** entry within New Harness or its editor. It selects reusable source files/directories and native runtime options, then previews the generated repository changes. Applying the preview writes into the same Harness draft and opens those files in Monaco.

Selected reusable skill directories include their supporting files and exact source attribution. Shared MCP/settings destinations may need a reviewed merge; there is no automatic universal conversion between runtime formats. An optional assembly recipe can retain source snapshot pins but must not become a mandatory extra artifact or separate publication step.

Configuration editing and export are the initial capability. A visual sequence, pre/post hook, or agent handoff does not prove that SkillShare can execute it. Runtime execution, approvals, credentials, cost estimates, and observed evaluations remain separate integrations.

Forking a Harness copies an exact release into an independent draft with source lineage and no inherited ratings. Copying a skill folder into another Harness records file/directory provenance without requiring the copied skill to become a separately published asset. Source updates offer a reviewed diff and never overwrite the destination draft automatically.

## 8. Migration of existing projects and assets

1. Map each existing project to one Harness identity while retaining IDs, ownership, visibility, and old URL aliases. Avoid introducing two parallel user-facing containers.
2. Build a migration preview from its existing native component files. Preserve original paths and per-file source/reuse terms; include referenced content only when reuse and access permit it.
3. Resolve duplicate native paths explicitly. Two component packages may both own `.claude/settings.json` or `.gemini/settings.json`; do not concatenate JSON or silently pick a winner. Offer content comparison and validated merge or keeping separate drafts.
4. Map migrated paths/file IDs to original asset and release IDs. Legacy agent/skill deep links open the corresponding Harness file when mapping is unambiguous; unresolved links retain the old read-only detail page.
5. Preserve old component and project releases and their export behavior. Historical project manifests are not rewritten as if they had always been one repository snapshot. A migrated Harness's first repository release is a new release with explicit ancestry.
6. Offer explicit native-file conversion for instruction-only legacy assets and existing workflow compositions. Preserve originals; do not fabricate tool permissions or claim automatic cross-runtime compatibility.
7. Move reviews/stars/saves with their target semantics preserved. Project reviews can remain Harness-level; legacy asset reviews stay labeled with their original asset/release context and are not automatically aggregated into the Harness rating.
8. Retire component-first creation and required per-component release controls after successful migration. Keep compatibility reads and redirects until old links and clients have a supported transition.

Run a repeatable migration audit for collisions, missing files, inaccessible references, invalid native content, and differing reuse terms before applying changes. Use additive migrations and retained legacy snapshots; failed conversion leaves current content usable.

## 9. Implementation order

| Stage                        | Deliverable                                                                                        | Completion evidence                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1. Repository foundation     | Harness/file/revision/release contracts and storage, runtime-profile naming, compatibility mapping | Atomic changesets, concurrency, immutable snapshots, authorization tests                   |
| 2. Import and editor         | Single file/folder/ZIP import; one explorer and Monaco workspace; raw draft saving and diagnostics | Lossless import/export, folder operations, retained edits, desktop/mobile browser journeys |
| 3. Publication and migration | Harness release review, forks, multi-file proposals, legacy previews and redirects                 | Collision handling, attribution, old release availability, idempotent migration fixtures   |
| 4. Derived discovery         | File-based agents/skills/configuration search and release-linked detail views                      | Correct profile detection, unknown-file retention, permission-filtered results and counts  |
| 5. Optional integration      | Git import followed by reviewed branch/PR synchronization; workflow generation into native files   | Remote conflict/retry tests and explicit generated changes preview                         |

Git synchronization should use a scoped GitHub App/OAuth connection, separate network workers, and an exact remote base commit. Show the outgoing changes and selected branch; prefer a branch/change proposal flow. Handle remote advancement and permission failure without discarding the local draft. No upload operation should silently push to GitHub.

## 10. Acceptance scenarios

- Upload only `.claude/agents/reviewer.md`: edit and publish one Harness without creating a skill, hook, or MCP asset first.
- Import a complete `.github` folder with agents, nested skills, references and hooks: every supported file appears at its original path and opens directly.
- Keep `.claude`, `.github`, `.gemini`, and root/workspace config files in one Harness: switching files uses the same workspace and runtime-specific diagnostics.
- Import a bare agent file: resolve its destination explicitly when ambiguous, then retain its actual content.
- Edit an agent, `SKILL.md`, a reference file and settings/hooks in one session: tabs and unsaved changes survive switching; one Harness release snapshots the complete saved tree.
- Save invalid JSON/frontmatter as a draft: preserve exact text, show line diagnostics, and explain any publication blocker.
- Rename a folder containing references: preserve file identity, show known affected paths, and avoid unreviewed prompt/script rewrites.
- Concurrent editors/import retries: preserve both users' work, detect stale revisions, and avoid partial or duplicate writes.
- Export a release: reproduce supported native content, paths and available file modes without injecting generated wrappers into runtime files.
- Fork and modify a Harness: show exact ancestry and differences; keep source unchanged and ratings independent.
- Private/team/public releases: logged-out users and unauthorized members cannot read drafts, snippets, source diffs or restricted exports; public viewers receive usable actions only.
- Migrate legacy components with colliding settings paths: require a reviewed resolution; old releases remain accessible according to their permissions.

These are planned validation criteria, not completed Harness test results. Previous project/component tests do not establish that the new repository model works.

## 11. Scope of this planning change

The initial implementation adds a Harness repository path with file/folder import, a collapsible path tree, one Monaco editor, debounced revision-aware draft saves, exact release snapshots, public/private/team visibility, viewer invitations, and owner-only editing. Public Harnesses are searchable in Explore. Existing project and component endpoints remain available for legacy content. Legacy project contents have not yet been migrated into Harnesses because native path collisions need explicit review.

The editor now includes reviewed native templates for agents, skills, MCP servers, settings, and pre/post hooks. Claude and Gemini shared settings preserve unrelated keys and comments. A derived component inspector opens the underlying file; structural MCP/hook diagnostics appear in Monaco and block publishing through both UI and API, while incomplete drafts remain saveable. Public release browsing, exact-version selection/link sharing, original-tree ZIP downloads, and save-conflict comparison/recovery are implemented. Runtime profiles are exposed separately at /api/runtime-profiles.

Native creation opens editable source with a separate Review changes tab. New skill generates the selected runtime's skill folder and `SKILL.md`; MCP configuration opens an existing file directly, including invalid JSON for repair. The repository explorer now has file tabs, filtering, right-click actions, inline file/folder creation and rename, folder deletion with undo, F2 rename, and Ctrl/Cmd+S. Empty folders are represented by `.gitkeep`. Owners can switch from immutable releases through Edit draft.

Validated: all 125 unit/API tests pass, including 10 native configuration tests and 43 API integration tests. Coverage includes immutable snapshots, unpublished draft isolation, explicit viewer access, configuration publication blocking, and original-tree ZIP export. Two Harness browser tests pass: actual skill editing for Claude/Gemini/Copilot, direct MCP editing and malformed-JSON repair, reload persistence, right-click file creation/rename, MCP/pre/post hook publication, release selection, download, anonymous access, Edit draft, and responsive mobile layout. Runtime commands and connections have not been executed.

Remaining stages: multi-file proposals/forks, reviewed legacy project migration, discovery indexing of files, and Git import/synchronization. ZIP import and a workflow-to-native-files generator are also not wired into this implementation.
