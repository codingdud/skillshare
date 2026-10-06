# Harness version control and npm CLI plan

Status: core implementation completed on 2026-10-02. `apps/cli` supports setup/login/logout, binding, status/diff, push/pull, publishing Harness releases, and recovery; the API and browser support device approval and working revision history. The publisher confirmed npm publication of `@skillsync/cli@0.1.1` on 2026-10-02. See [the implementation guide](cli.md) for actual commands and schemas. The detailed sections below retain the broader researched target: deduplicated blobs, branch contributions, organization roles, restricted per-Harness tokens, and cross-platform distribution verification remain future work.

## 1. Intended experience

A developer maintains native AI files in their existing codebase. SkillShare connects that codebase to one remote Harness, records reviewable file history, and publishes an immutable release when requested.

The first implementation supports one Harness binding per codebase with several runtime profiles. It does not require separate skill, agent, MCP, hook, or workflow records.

```sh
# Install the published CLI in your codebase.
npm install --save-dev @skillsync/cli
npx @skillsync/cli setup

# Connect an existing codebase to a Harness without replacing local files.
npx @skillsync/cli add <harness-id> --link-only
npx @skillsync/cli status
npx @skillsync/cli diff
npx @skillsync/cli push --dry-run
npx @skillsync/cli push -m "Add review agent and post-tool hook"
npx @skillsync/cli publish 1.1.0 --notes "Add review agent and post-tool hook"
```

Setup opens the browser, confirms the SkillShare account, selects the workspace and runtime profiles, and shows which paths will be managed. After login, the CLI displays the server-confirmed user ID and account. It stores credentials outside the codebase.

For someone consuming a published Harness:

```sh
npx @skillsync/cli add <harness-id> --profile claude-code --version 1.1.0
# Review proposed writes; installs the exact release and records its identity.
npx @skillsync/cli pull --version 1.2.0 --dry-run
npx @skillsync/cli pull --version 1.2.0
```

For someone starting with only local files and no remote Harness:

```sh
npx @skillsync/cli init --name review-toolkit --private --profile gemini-cli
npx @skillsync/cli push -m "Initial native configuration"
```

`init` creates a private Harness through the existing creation service, collects its required description/slug, and binds it locally. `add` connects an existing Harness. Both use the same native file scanner and preview.

## 2. What already exists and what is missing

| Current implementation                                                | Required enhancement                                                                                     |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `harnesses.draft_files` and an integer revision counter               | Immutable revision history with parent, author, origin, content hash, and change summary                 |
| Immutable `harness_releases` containing a whole file tree             | A release points to an exact revision; preserve existing release IDs, versions, links, and contents      |
| Whole-tree `PUT /api/harnesses/:id/files` with optimistic concurrency | Atomic, conditional file changesets; preserve paths outside the selected sync scope                      |
| Browser access JWT and rotating HttpOnly refresh cookie               | Separate CLI device authorization and CLI refresh transport, using the same account and revocation rules |
| Authorization exposes only `req.userId`                               | A principal includes session, client kind, scopes, and permitted Harness IDs                             |
| Global write requests require an approved browser Origin              | Authenticate CLI bearer requests before the write guard; preserve the browser Origin requirement         |
| Owner-only draft writes; invitations create viewers                   | Keep owner writes for the first CLI release, then explicitly implement editor/publisher capabilities     |
| Native runtime registry and Monaco editor                             | Shared runtime sync adapters, history/compare screens, CLI install instructions, and device management   |
| No npm CLI workspace                                                  | Add a distributable `apps/cli` with isolated commands, services, and adapters                            |

The current global Origin guard would reject CLI POST/PUT requests with 403, even with an access token, because it runs before bearer authentication. Fixing that boundary is a prerequisite, not a reason to remove browser protection.

## 3. Research findings and resulting decisions

### Browser authentication and credential persistence

[GitHub CLI login](https://cli.github.com/manual/gh_auth_login) uses browser login and a system credential store, with a plaintext fallback. [GitHub's device-flow documentation](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow) demonstrates browser approval followed by CLI polling.

Use a SkillShare device grant based on [RFC 8628](https://datatracker.ietf.org/doc/html/rfc8628). This works when the browser is on another device, including SSH, WSL, and containers. The CLI is a public client with no embedded client secret. SkillShare authenticates its own users; GitHub or Claude credentials are not reused.

[Claude Code authentication](https://code.claude.com/docs/en/authentication#credential-management) documents macOS Keychain storage and platform-specific credential files elsewhere. Therefore, “like Claude Code” should mean a persistent, revocable login, not copying its token files or assuming every platform uses a keychain.

Prefer an OS credential store for SkillShare. If persistent storage is unavailable, offer a memory-only session or an explicitly selected restricted file store. Never silently downgrade to plaintext. [RFC 9700](https://datatracker.ietf.org/doc/html/rfc9700#section-2.2.2) requires sender-constrained refresh tokens or rotation for public clients; reuse rotation and replay revocation.

An alternative is a native browser authorization-code flow with PKCE and a loopback listener, described by [RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252). Defer it: device authorization meets the initial desktop and remote-terminal requirements with one flow.

### Native files stay native

[Claude's directory reference](https://code.claude.com/docs/en/claude-directory) distinguishes shared project files from personal configuration. [Gemini configuration](https://geminicli.com/docs/reference/configuration/) defines project settings separately from user settings. [Copilot CLI configuration](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference) supports repository settings and restricts their keys.

Design decision: store the Harness ID and runtime bindings in `.skillshare/config.json`. Do not add an invented `projectId` or a SkillShare token to third-party settings or agent frontmatter. The CLI reads its own binding and updates the selected native files. This satisfies the connection requirement while preserving native schema compatibility.

### Paths to support

| Runtime profile | Default sync candidates, after preview                                                                                                    | Configuration distinctions                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Claude Code     | Project `.claude` definitions/resources, `CLAUDE.md`, `.mcp.json`                                                                         | Hooks/permissions in `.claude/settings.json`; exclude local overrides and personal state                         |
| Gemini CLI      | Project `.gemini` definitions/resources, `GEMINI.md`                                                                                      | MCP and hooks in `.gemini/settings.json`                                                                         |
| Copilot VS Code | `.github/agents`, `skills`, `instructions`, `prompts`, `hooks`, `copilot-instructions.md`; selected `.vscode/settings.json` and MCP files | Preserve `.vscode/mcp.json` with `servers` and portable `.mcp.json` with `mcpServers`                            |
| Copilot CLI     | Copilot repository definitions, `.github/copilot/settings.json`, `.mcp.json` and existing `.github/mcp.json`                              | Personal `~/.copilot` state is excluded; hooks remain runtime-specific                                           |
| Copilot cloud   | Supported repository agent/skill/instruction/hook files                                                                                   | Cloud MCP settings require GitHub configuration; uploading a local MCP file does not configure the cloud service |

Sources for MCP and hooks: [Claude MCP](https://code.claude.com/docs/en/mcp), [Gemini MCP](https://geminicli.com/docs/tools/mcp-server/), [Gemini hooks](https://geminicli.com/docs/hooks/reference/), [VS Code MCP](https://code.visualstudio.com/docs/agent-customization/mcp-servers), [Copilot CLI hooks](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks), and [Copilot cloud MCP](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/configure-mcp-servers).

Additional `.agents` skills, root `AGENTS.md`, scripts, and referenced files can be selected explicitly. A path shared by profiles is stored once. Selecting Claude and Copilot must not duplicate `.mcp.json` or convert its contents.

Do not upload all of `.github` automatically: workflows, issue templates, and repository administration files need their own explicit selection. Do not follow references or symlinks outside the codebase.

Two registry corrections are required before shipping adapters:

1. `copilot-cli.settings` is currently empty; add the documented repository settings path and supported schema.
2. `copilot-cloud.mcp` currently suggests `.github/mcp.json`. Distinguish the CLI's file support from cloud repository MCP settings. Mark cloud activation as manual setup, not file-sync support.

## 4. Local configuration and identity

Keep three separate storage responsibilities:

| Location                       | Stored information                                                                                      | Git behavior                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `.skillshare/config.json`      | Server origin, Harness ID, runtime profiles, selected path patterns, manifest schema version            | Commit when the team intends to share the binding     |
| `.skillshare/lock.json`        | Exact installed release/revision IDs, complete release tree hash, selected-file hashes, adapter version | Commit for reproducible installation                  |
| `.skillshare/local/`           | Sync baseline, pending operations, recovery backups, selected account reference, conflict state         | Ignore                                                |
| OS credential store            | Refresh credential keyed by trusted server and account                                                  | Never part of repository                              |
| User-level SkillShare settings | Known servers, active account/user IDs, workspace preference, credential-store type                     | Outside repository; no raw token in ordinary settings |

Example proposed tracked binding:

```json
{
  "schemaVersion": 1,
  "server": "https://skillshare.example.invalid",
  "harnessId": "immutable-harness-uuid",
  "profiles": ["claude-code", "gemini-cli", "copilot-vscode"],
  "include": [
    ".claude/**",
    ".gemini/**",
    ".github/agents/**",
    ".github/skills/**",
    ".github/instructions/**",
    ".github/prompts/**",
    ".github/hooks/**",
    ".github/copilot-instructions.md",
    "CLAUDE.md",
    "GEMINI.md",
    ".mcp.json",
    ".vscode/mcp.json"
  ],
  "exclude": [],
  "defaultRef": "main"
}
```

The URL and ID are illustrative, not deployed values. `main` is the initial single draft head; additional branches are deferred. Profile selection generates the actual include list and hard exclusions; user excludes can only narrow it.

The shared config identifies the Harness, not a personal owner. Each developer authenticates independently. Derive the acting user from the verified server session; never trust a user ID supplied in the manifest or push request.

The current data model owns Harnesses through users and shares them through Harness memberships. Initial setup selects the personal account and an accessible Harness; organization ownership/workspace administration needs a separate model enhancement before it can be offered as a real CLI destination.

`setup` checks root selection, detects candidate profiles, lets the user choose among Copilot environments, and prints the final selected paths. Detection does not claim that an installed runtime has been tested. Work from a subdirectory by locating the nearest explicit SkillShare binding; prompt for a root on first setup rather than using a home directory.

If Git is present, offer the exact `.gitignore` addition for `.skillshare/local/`. Do not modify Git remotes, install Git hooks, or run Git pushes. A normal `git push` and a `sks push` remain separate operations.

A repository config can change its server URL. Require explicit trust for a new server before authentication or network writes; never send an existing server's credentials to a URL supplied by the repository or a redirect.

## 5. Browser authorization, tokens, and authorization

Proposed login flow:

1. CLI requests device authorization from its trusted SkillShare server. Return a high-entropy device code, short user code, verification URL, expiry, and polling interval.
2. Print the user code and open the verification URL in the system browser. `--no-browser` prints the URL for remote terminals. Never put the device code or tokens in browser URLs.
3. Browser login uses existing login/email verification/password recovery. Preserve a validated relative return path back to device approval.
4. Approval shows the account, code, requested capabilities, and requesting client label. Ask the user to match the terminal code; allow switching account and denying the request. A client-supplied device name is descriptive, not verified hardware identity.
5. CLI polls according to the returned interval; handle pending, `slow_down`, denial, and expiry. Cancellation ends polling. Rate-limit code creation, code entry, and polling independently.
6. Atomically consume the approved grant once and create a CLI session. Return a short-lived access JWT and rotating refresh credential only to the CLI.
7. Persist the refresh credential in the chosen credential store. Keep access JWTs in process memory and show authenticated account/workspace without displaying tokens.

Recommended starting policy: 10-minute device grants, 5-second polling, existing 10-minute access JWT duration, and an explicitly configured CLI refresh/session lifetime. These are proposed product settings, not measured results.

Scopes:

- `harness:read`: permitted published releases; draft/history access additionally requires the proper Harness role.
- `harness:write`: create Harnesses and change authorized drafts.
- `harness:publish`: publish a reviewed revision.
- `offline_access`: allow refresh credential issuance.

The effective permission is the intersection of session scope, live membership/ownership, and any Harness restriction. Scopes do not grant access to another user's Harness. Start with owner write/publish and existing viewer reads. Implement editor/publisher permissions deliberately before enabling team writes.

CLI sessions must have a separate client kind from browser sessions. Refresh endpoints validate client kind and never accept a browser refresh cookie as CLI authorization. Retain JWT algorithm/issuer/audience validation, email verification, DB-backed revocation, and password-reset revocation.

On 401, refresh once and retry an operation once; on 403, show the actual permission error. Use an in-process refresh queue plus a cross-process lock per server/account so concurrent CLI commands do not reuse rotating refresh tokens. Persist the new refresh credential atomically before releasing waiting operations. If a refresh response is lost or persistence fails, request login again rather than replaying a consumed credential.

`auth logout` revokes the CLI session and removes its local credential. If offline, remove the credential and explain that server revocation is pending; browser device management can revoke the remaining session. Add browser controls to inspect and revoke individual CLI sessions.

Credential-store adapter: evaluate [@napi-rs/keyring](https://github.com/Brooooooklyn/keyring-node/blob/main/README.md) behind a small interface. Its Linux backend can fall back to an in-memory kernel keyring; require persistent Secret Service for persistent login or visibly select session-only storage. Prove Windows/macOS/Linux behavior before committing to this dependency. A protected-file alternative needs POSIX `0600` and owner-only Windows ACL handling; `chmod` alone is not a Windows access policy.

## 6. Version control model

Add immutable revisions for all accepted content saves and CLI pushes:

```text
Harness
  main head -> revision R8
  revisions R1 -> R2 -> ... -> R8
  releases v1.0.0 -> R5; v1.1.0 -> R8
```

A revision records parent, actor, source (`web`, `cli`, `migration`, `restore`), timestamp, message, tree hash, and complete path/blob/mode manifest. Web autosaves remain debounced and generate a descriptive save message; they do not prompt on every keystroke. A no-op save produces no new revision.

Store text blobs by SHA-256 within an authorized Harness namespace. Hash exact UTF-8 content without normalizing whitespace or line endings. Hash the canonically sorted tree manifest including path, blob hash, and executable mode. Do not expose global hash-existence lookup or unauthenticated blob downloads.

Track renames as an explicit operation when available; infer them for display only when unambiguous. File executable mode matters for hook scripts: preserve POSIX mode, use the Git index when available on Windows, and require explicit mode selection where it cannot be inferred.

Add revision history, revision-to-revision comparison, file history, release-to-release comparison, and restore. Restoring creates a new revision after preview; it never rewrites old history.

`push` creates a private working revision under existing Harness access rules. It does not change visibility or create a release. `publish` freezes the explicitly reviewed revision for the complete Harness and requires release notes/version plus publish permission. Explore continues to read only published releases.

For the first iteration, use one draft head. Branches, change proposals, Harness forks with lineage, and GitHub integration follow after reliable sync. Do not describe these as available in the initial CLI.

Continue using three-part release versions initially. Define "latest" as the designated most recently published release, expose its exact ID, and keep version-number ordering separate from publication ordering. Installing without a version resolves that designation once and pins it; it does not follow latest automatically.

Migration:

1. Add revision/blob tables and a head revision reference without deleting current draft/release columns.
2. Backfill every existing release and current draft from their actual stored contents. Preserve release IDs, URLs, versions, and attribution.
3. Record unavailable historical authors/parents as unknown; an old integer counter cannot reconstruct lost drafts. Do not invent historical commits.
4. Route web saves, CLI pushes, restores, and publication through one transactional revision service. Retain integer revision compatibility temporarily.
5. Verify file equality and authorized export/discovery behavior before removing duplicated snapshot columns in a later migration.

## 7. Sync rules that prevent lost work

`add <id>` normally resolves an exact published release, previews selected native files, installs them, and writes the binding/lock. A differing existing file is a collision and blocks application until resolved. `--link-only` binds and fetches the remote draft baseline for an authorized writer without writing native files. An unpublished Harness requires `--draft` for an authorized owner or `--link-only`.

No command may infer ownership from possession of an ID. A reader can install a release but cannot push to its owner. Independent editing of someone else's Harness will later require an attributed Harness fork, not an asset variant record.

Use a three-way comparison of the last synchronized baseline, local managed files, and remote draft:

| Comparison                                          | Outcome                                         |
| --------------------------------------------------- | ----------------------------------------------- |
| Local and remote unchanged                          | No operation                                    |
| Local changed; remote unchanged                     | Push candidate                                  |
| Local unchanged; remote changed                     | Pull candidate                                  |
| Both changed to the same hash                       | Advance baseline without rewriting              |
| Both changed differently, including edit/delete     | Conflict; show paths and preserve both versions |
| Remote file outside selected profiles/managed scope | Leave untouched                                 |
| Local file vanished but was never managed           | Do not delete remote content                    |

Do not automatically merge JSON settings, MCP entries, or hooks for the first release. Whole-file conflict review is predictable and preserves comments. A missing selected directory on a fresh machine is not permission to erase remote files. Explicit deletions appear in the dry-run preview and require `--allow-delete`; shrinking the include list only unmanages paths.

Push protocol:

1. Validate the binding, trusted host, current account, access, and selected paths.
2. Enumerate regular files, apply hard exclusions and custom excludes, validate sizes/paths, and capture hashes.
3. Fetch the authorized head/manifest; calculate local/remote/base differences.
4. Show additions, modifications, deletions, modes, ignored files, and conflicts. `--dry-run` performs no mutation.
5. Send only the reviewed operations with the expected head and an idempotency key.
6. Server authorizes again, locks the head, validates every operation, applies changes to the complete remote tree, records one revision, and commits atomically.
7. Update local baseline only after success. Retry a lost response using the same idempotency key. A moved head returns 409; refresh and compare again.

For pull, fetch and verify content hashes, stage writes under ignored local state, recheck local hashes before applying, and retain a recovery journal/backups until completion. A multi-file filesystem update is not one atomic transaction; interruption must offer recovery and must not advance the baseline prematurely.

Default `pull` follows the pinned release until `--version` selects another release. Authorized writers use `pull --draft` to obtain remote working changes. `publish` shows the entire remote revision, including profiles not bound on this machine. The lock records the last installed release; pushing a draft only updates local sync state.

## 8. File selection, secrets, and runtime behavior

Default exclusions cover:

- Credentials/tokens, `.env` files, private keys, local override settings, permission/trust decisions, transcripts, sessions, caches, temporary files, logs, dependency directories, and `.git`.
- Claude `settings.local.json`, `CLAUDE.local.md`, and any copied credential files.
- Gemini OAuth/MCP/A2A token files and copied account/runtime state. [Gemini's storage source](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/config/storage.ts) identifies these separately from project configuration.
- Copilot local override files and any copied personal login/session state.
- SkillShare credentials and `.skillshare/local`.

Apply these exclusions client-side and server-side. Preview excluded paths without printing their contents. Include selected documentation/resources/scripts as ordinary files. Referenced out-of-scope scripts produce a diagnostic and require explicit in-root selection.

Share MCP URLs, arguments, environment-variable references, and hook commands as configuration. Detect likely literal secrets and block upload with the relevant path/key; instruct the author to replace them with native environment references. This detection is not a complete secret guarantee. Do not silently redact a secret and overwrite the local file.

Current constraints are text files, up to 1,000 files and a 5 MB total snapshot. Preserve these until a separate binary/object-storage design is delivered. Reject unsupported binaries and report limits. Extend metadata for executable mode without pretending text import already preserves it.

Reject path traversal, absolute/drive/UNC paths, case-colliding names, Windows reserved filenames, symlinks/junctions, and any resolved path outside the selected root. Recheck targets before writes.

SkillShare commands do not execute hooks, start MCP servers, expand environment variables to secret values, or approve runtime tools. Installing a file can affect the next native runtime session, so the apply preview must surface new hook commands, MCP processes/URLs, and permission changes before writing them.

## 9. Proposed API and database changes

All routes below are proposed. Use the existing layered service/repository approach.

| API                                                   | Purpose                                                              |
| ----------------------------------------------------- | -------------------------------------------------------------------- |
| `POST /api/oauth/device/code`                         | Start public-client device authorization                             |
| `POST /api/oauth/token`                               | Device grant exchange or CLI refresh grant; form-encoded OAuth input |
| `GET /api/auth/device-request?code=...`               | Browser-authenticated consent details, no device secret              |
| `POST /api/auth/device-decision`                      | Browser-authenticated allow/deny                                     |
| `GET /api/auth/devices`                               | List caller's CLI sessions                                           |
| `DELETE /api/auth/devices/:sessionId`                 | Revoke an owned session                                              |
| `POST /api/oauth/revoke`                              | Revoke a CLI refresh credential/session                              |
| `GET /api/harnesses/:id/manifest?ref=...`             | Authorized draft/release manifest and capabilities                   |
| `POST /api/harnesses/:id/changesets`                  | Conditional atomic upsert/delete/mode/rename operations              |
| `GET /api/harnesses/:id/revisions`                    | Authorized, paginated revision history                               |
| `GET /api/harnesses/:id/revisions/:revisionId`        | Exact authorized snapshot                                            |
| `GET /api/harnesses/:id/compare?base=...&head=...`    | Authorized file differences                                          |
| `POST /api/harnesses/:id/restore`                     | Previewed revision restoration as a new head                         |
| Existing `POST /api/harnesses/:id/releases`, extended | Publish an exact reviewed revision                                   |

Return capabilities and protocol/schema version with the manifest. Use defined errors for unsupported client version, unknown profile, oversized tree, conflict, access restriction, token expiry, and missing release. Do not leak private Harness existence in error details.

Add `device_authorizations` with hashed device/user codes, approved user, requested/approved scopes, expiry, polling state, and consumption state. Extend sessions with client kind, client ID, scopes, optional Harness restrictions, label, last-used time, and revocation metadata; refresh token records remain hashed.

Add `harness_revisions`, `harness_blobs` scoped to a Harness, head reference, release revision reference, and `harness_changesets` for operation metadata/idempotency. Scope idempotency keys by caller and Harness, retain the request hash/result, and reject reuse with a different payload.

Authenticate before deciding whether a business write can omit Origin. Only a verified CLI principal with the required scope can use the cookie-free CLI path. Explicit device/token/revocation protocol endpoints ignore browser cookies and have independent validation/rate limits. Browser consent and browser-auth mutations still require the approved Origin. Keep CORS and the existing browser refresh queue.

Configure the public API and browser base URLs explicitly. Production requires HTTPS; development may use explicitly trusted loopback HTTP addresses, with API port 4000 and browser port 5173. Validate the browser verification destination against the selected server's trusted configuration and reject credential-bearing cross-origin redirects.

Check authorization for every revision, blob, comparison, and release; knowing a hash or revision ID is never enough. Public viewers see published history only; editor-access working history must not leak via public comparisons.

## 10. Project structure and libraries

```text
apps/cli/
  package.json
  src/bin.ts
  src/commands/       setup, auth, init, add, status, diff, push, pull, publish
  src/services/       authentication, binding, sync, release
  src/adapters/       credentials, browser, filesystem, git-metadata
  src/output/         terminal formatting, JSON output, errors
packages/harness-sync/
  src/manifest.ts
  src/hash.ts
  src/selection.ts
  src/compare.ts
packages/contracts/src/cli-auth.ts
packages/contracts/src/harness-versioning.ts
apps/api/src/modules/cli-auth/  controller, service, repository, routes
apps/api/src/modules/harnesses/  shared revision and changeset services
apps/web/src/features/devices/
apps/web/src/features/harnesses/  history, compare, CLI connection panel
```

Keep filesystem/process imports in CLI adapters; `harness-sync` contains pure selection/comparison rules and portable hashing interfaces. Reuse existing native validators and Zod contracts instead of maintaining independent frontend/backend/CLI schemas.

Use TypeScript and Node.js 22.12+ to match the workspace baseline. Candidate CLI libraries: [Commander](https://github.com/tj/commander.js) for parsing/help and [open](https://github.com/sindresorhus/open) for opening a validated browser URL. Use built-in fetch, crypto, and filesystem APIs behind adapters. Fetch current Context7 docs for any selected library API during implementation, and pin tested dependency versions rather than adding `latest`.

The `@skillsync/cli` package exposes `"bin": { "sks": "./dist/bin.js" }` with a Node shebang. Publish built files, license, and README through an explicit package file list; bundle or publish shared internal dependencies so the tarball works outside this monorepo. [npm package documentation](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/) describes executable entry points and package contents.

Support global installation, project devDependency installation, and temporary npx execution. No installation lifecycle script should authenticate, edit the codebase, or download an unreviewed executable.

Validate the packed tarball before registry publication. Use [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) once the owned scope/repository is configured; provenance availability depends on the publishing environment and public repository/package conditions. Do not promise a published package until those prerequisites are satisfied.

## 11. Frontend updates

- Harness overview/editor: a compact **Use with CLI** action opens installation/binding commands with the correct ID and selected release. Keep the editor viewport intact.
- **History**: author, time, web/CLI origin, message, revision, and changed file count.
- **Compare**: changed-file tree and Monaco diffs, including added/deleted files and permission/MCP/hook changes; immutable release comparisons.
- **Restore**: preview affected paths and create a new draft revision.
- **Authorize CLI**: code matching, account switching, scopes, allow/deny, and expired/consumed states.
- Profile/account menu: **Connected devices**, last use, and revoke.
- Conflict recovery: preserve web edits when a CLI push moves the head; compare, export local edits, or reload.

Hide unavailable controls by role. Read-only consumers can copy an install command; write/publish commands require the corresponding capabilities. Do not introduce standalone asset creation or bring back the removed Explore promotional section.

## 12. Ordered delivery and acceptance criteria

| Step                           | Change                                                                                                        | Completion evidence                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1. Contracts and runtime audit | Define binding, lock, modes, revisions, scopes, errors, and adapter selection; correct Copilot capabilities   | Native fixtures for Claude/Gemini/Copilot remain valid; no unsupported SkillShare keys are inserted |
| 2. Version history foundation  | Migrate snapshots, record immutable revisions, conditional changesets, and exact-revision publication         | Existing release exports are unchanged; stale head and retry tests pass                             |
| 3. Browser/CLI auth            | Device grant, scoped CLI sessions, credentials adapter, device consent/revocation, safe Origin handling       | Browser auth regression tests plus approval/denial/expiry/replay/revocation tests pass              |
| 4. npm CLI setup and binding   | Package workspace, help, setup/login/status/logout, init/add, root/profile discovery                          | Packed CLI works in a separate developer repository on supported platforms                          |
| 5. File sync                   | Dry-run, status/diff, push/pull, managed deletions, hash verification, interrupted-write recovery             | Concurrent web/CLI edits cannot overwrite each other; unselected files are preserved                |
| 6. Releases and web history    | CLI publish, lock handling, history/compare/restore, copy install command                                     | Consumer installs an exact immutable release and reviews a subsequent update                        |
| 7. Distribution                | Cross-platform matrix, tarball audit, version/protocol compatibility, npm scope and trusted publisher         | Reproducible package installation and complete documented local-to-web-to-local journey             |
| Later                          | Multi-Harness bindings, branches, attributed forks/proposals, scoped CI credentials, Git provider integration | Designed and validated independently after core sync                                                |

Important checks:

1. Device grants can be approved/exchanged once; pending/backoff/expiry/denial are correct; browser password recovery still works.
2. Browser cookies/Origin behavior remains protected; valid CLI bearer writes work; invalid credentials, missing scope, and revoked membership fail.
3. Concurrent CLI processes refresh once; refresh replay revokes the family; lost refresh responses do not cause endless retries.
4. Draft pushes remain absent from public discovery until publication; draft history never leaks to public readers.
5. Changed/unchanged files, same-hash edits, edit/delete conflicts, remote races, and idempotency have defined outcomes.
6. Local overrides, credentials, unrelated GitHub files, out-of-root paths, and symlinks are rejected or excluded without exposing contents.
7. Markdown, JSONC comments, line endings, executable scripts, and exact source bytes survive round trips.
8. Interrupted pulls recover; no local baseline advances before confirmed completion; new hook/MCP/permission changes are visible in review.
9. Credential-store behavior is verified on Windows/macOS/Linux, including Linux without Secret Service.
10. The npm tarball contains only intended files and works without the monorepo; unsupported Node/protocol versions produce clear errors.

First end-to-end validation: authenticate in browser -> bind a local codebase -> push an agent, skill, MCP, and pre/post hooks together -> inspect the revision in Monaco -> make a conflicting browser edit -> resolve without lost work -> publish -> install the exact release into another codebase -> revoke the CLI session and confirm further writes fail.

This plan intentionally adds revision control and native folder synchronization within the Harness model. The requested planning stage is complete when this document is reviewable; runtime implementation begins as a separate task.
