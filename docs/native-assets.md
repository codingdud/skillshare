# Native skills and agents

Research and implementation reference, updated October 2, 2026. See [asset modules](asset-modules-implementation.md) for the current profile matrix and configuration modules. These profiles target Claude Code, GitHub Copilot in VS Code, and Gemini CLI. Copilot cloud agents and the SDK can differ from the VS Code profile.

| Platform           | Skill entry                      | Agent entry                      | Important configuration                                                                                                   |
| ------------------ | -------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Claude Code        | `.claude/skills/<name>/SKILL.md` | `.claude/agents/<name>.md`       | `tools`, `disallowedTools`, `model`, `permissionMode`, `skills`, `maxTurns`, `mcpServers`, `hooks`, `memory`, `isolation` |
| Copilot in VS Code | `.github/skills/<name>/SKILL.md` | `.github/agents/<name>.agent.md` | `tools`, `model`, `agents`, `handoffs`, `user-invocable`, `disable-model-invocation`                                      |
| Gemini CLI         | `.gemini/skills/<name>/SKILL.md` | `.gemini/agents/<name>.md`       | `kind`, `tools`, `model`, `temperature`, `max_turns`, `timeout_mins`, `mcpServers`                                        |

Skills progressively load a short discovery description, their instructions when activated, and supporting resources when needed. A common skill package is:

```text
.claude/skills/review-changes/
  SKILL.md
  references/
    checklist.md
  scripts/
    check.py
  assets/
    report-template.md
```

`SKILL.md` starts with YAML frontmatter (`name` and `description`) followed by Markdown instructions. The name matches its folder. Link to supporting resources relative to the Markdown file. Scripts are source code, not automatically executed during import, publication, or export. The current file editor supports UTF-8 text, not binary attachments.

Agents are individual Markdown definition files with YAML frontmatter and a system prompt body. Their tool selection and delegation controls are runtime-specific. Claude uses `Agent(name)` tool restrictions and preloaded `skills`; Copilot VS Code Local uses `agents` with the agent tool and can offer `handoffs`; cloud/CLI capabilities differ; Gemini local agents use their own tool names and do not have an equivalent Copilot agents allowlist. Tool names must not be translated by string substitution. MCP credentials belong in the target environment, not exported source.

## Storage and lifecycle

- `content.nativePackage = { platform, entrypoint, files: [{ path, content }] }` is optional for backward compatibility.
- Files, comments, unknown frontmatter fields, and supporting content are preserved verbatim inside the existing JSONB draft/release snapshots. Additive module migrations update the asset kind constraint and project export metadata; existing file snapshots remain unchanged.
- When a package exists, its entry Markdown body is the authoritative instruction text. The API derives the legacy `instructions` projection on save and publish.
- Existing immutable releases stay unchanged. Convert an existing draft explicitly, or create a variant for another platform.
- `dependencies` pins skill releases; `subagents` pins agent releases. These are distribution references, separate from native runtime delegation rules.
- Drafts may retain incomplete YAML. Publishing and native export reject malformed required configuration. Unknown platform fields are preserved, not represented as fully validated.
- The browser and API share Zod path/size checks and YAML validation. Reject traversal, absolute paths, duplicate/case-conflicting paths, file/directory collisions, `.env`, and `.git` paths. Limit each file to 100 KB, each package to 64 files / 500 KB, and each export to 100 releases / 5 MB.
- Export follows exact release IDs, rechecks access to each dependency, preserves attribution in `skillshare-lock.json`, and rejects unsupported platform combinations and conflicting destination paths.

## Editor

The explorer toolbar and right-click menu offer New file, New folder, Rename, and Delete during draft editing and change proposals. New items start inside the selected folder; Enter applies the path and Escape cancels. F2 renames an item, and Shift+F10 opens its context menu. Folder renames move their children together, while deleting a folder removes its contents with Undo available. The required entry file and its containing folders cannot be deleted. Renaming paths does not rewrite links or frontmatter; package diagnostics highlight references to review. Empty folders persist in drafts, variants, comparisons, and native ZIP exports.

Folders expand and collapse by clicking their rows or using the left/right arrow keys. Select any file to inspect or edit it, and use Find a file to filter paths. The explorer and the application sidebar each have a chevron to collapse them; the application sidebar keeps its preference after a reload. Files use the full content width, with a taller editor and horizontal section navigation in draft editing.

On a release's Files tab, owners choose **Edit file** to open the selected path in their draft. Other signed-in contributors choose **Suggest changes**, edit the native package, and preview differences before submitting. Maintainers inspect differences against the proposal's exact source release and accept into the draft or close the proposal. The server validates native files and derives instructions from the entry file. Accepting a proposal requires an unchanged base draft; publication creates a separate release.

Files & instructions uses a folder explorer and a locally bundled Monaco editor with Markdown/YAML and JSON/JSONC highlighting, line numbers, folding, find, configuration field completion, and inline diagnostic markers. A plain-text mode remains available. Supporting Python, shell, JavaScript, and TypeScript files have syntax highlighting. A configuration inspector exposes tools, model, delegation, MCP, and hooks. Files can be added, imported, removed with undo, or reset individually to the source variant.

Publication checks establish structural validity, not tested runtime compatibility. Review inherited tool access and platform-specific behavior before installation. Importing/exporting does not authorize or execute tools.

## Official references

- [Claude Code skills](https://code.claude.com/docs/en/skills)
- [Claude Code subagents](https://code.claude.com/docs/en/sub-agents)
- [Copilot custom agents in VS Code](https://code.visualstudio.com/docs/copilot/customization/custom-agents)
- [Copilot agent skills](https://code.visualstudio.com/docs/copilot/customization/agent-skills)
- [Gemini CLI skills](https://geminicli.com/docs/cli/skills/)
- [Gemini CLI subagents](https://geminicli.com/docs/core/subagents/)
- [Agent Skills specification](https://agentskills.io/specification)
