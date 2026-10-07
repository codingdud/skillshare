# Harness CLI implementation and distribution

The distributable application is `apps/cli`. `packages/contracts` remains the shared schema library; its required source is bundled into the CLI, so consumers do not install a private workspace package.

The npm organization is `skillsync`, the package is `@skillsync/cli`, and the executable is `sks`. Install globally with `npm install -g @skillsync/cli`, then run `sks setup`, `sks push`, and `sks pull`. For a codebase, install with `npm install --save-dev @skillsync/cli` and use `npx sks`. Without a local installation, use `npx --package=@skillsync/cli sks setup`. The npm organization name and executable name are independent.

## Build, test, and pack

From the repository root, with Node.js 22.12 or newer:

```sh
npm install
npm run db:migrate
npm run cli:check
npm run cli:pack
```

`cli:check` runs the CLI type check, filesystem/synchronization tests, build, and executable help smoke check. `cli:pack` rebuilds through npm's `prepack` lifecycle and writes `.local/skillsync-cli-0.1.4.tgz`. Only built output, README, and package metadata are shipped. The browser/API are separate applications and are not included.

Additional commands:

```sh
npm test
npm run typecheck
npm run build
npm exec -- playwright test
npm run pack:check -w @skillsync/cli
```

The browser tests require the running API, web app, migrated database, and local demo seed. The CLI unit tests use temporary repositories under `.local` and mocked remote snapshots; API integration tests use an isolated embedded database.

For testing development builds, install the local tarball into a developer repository:

```sh
npm install --save-dev /absolute/path/to/skillsync-cli-0.1.4.tgz
npx @skillsync/cli --help
```

## Authenticate, upload, and pull

```sh
npx @skillsync/cli setup
# Windows can explicitly select encrypted storage without a native npm adapter:
npx @skillsync/cli setup --storage dpapi
# To explicitly select restricted plaintext file storage:
npx @skillsync/cli setup --storage file

npx @skillsync/cli add HARNESS_ID --profile claude-code --profile gemini-cli --link-only
npx @skillsync/cli status
npx @skillsync/cli diff
npx @skillsync/cli push --dry-run
npx @skillsync/cli push -m "Update agent and hook"
npx @skillsync/cli pull --draft --dry-run
npx @skillsync/cli pull --draft --yes
npx @skillsync/cli publish 1.0.0 --notes "First native configuration" --yes
```

`setup` starts a short-lived device grant. The browser displays the terminal code, account, and requested capabilities; users may approve or deny it. No SkillShare password is entered in the terminal. Use `--no-browser` for a manual verification URL and `--read-only` for a read-only session.

Supported profile names: `claude-code`, `gemini-cli`, `copilot-cli`, `copilot-vscode`, and `copilot-cloud`. Repeat `--profile` when binding. Native MCP, hooks, settings, agents, and skill resources remain in their documented runtime paths; SkillShare never inserts invented keys into third-party configuration.

To create a new remote private Harness from local files:

```sh
npx @skillsync/cli init --name my-toolkit --description "Reusable development review tools" --profile claude-code
npx @skillsync/cli push -m "Initial configuration"
```

To install a published release into another codebase:

```sh
npx @skillsync/cli add HARNESS_ID --profile claude-code --version 1.0.0 --dry-run
npx @skillsync/cli add HARNESS_ID --profile claude-code --version 1.0.0 --yes
npx @skillsync/cli pull --version 1.1.0 --dry-run
npx @skillsync/cli pull --version 1.1.0 --yes
```

A normal pull stays on the installed exact release. `--version` deliberately selects another release; `--draft` selects the current working tree and requires ownership. Pull preserves unrelated files and local-only changes. Same-path edit/edit or edit/delete conflicts stop writes; `diff` displays baseline, local, and remote content for review. Deletions require `--allow-delete`. MCP/hook/settings changes require explicit application with `--yes`; the CLI does not execute imported commands.

After inspecting a conflict, use `sks resolve .claude/agents/reviewer.md --keep local --draft --yes` to retain your version, or `--keep remote` to accept the remote version. Use the same `--draft` or `--version` as the conflicting operation. Then retry that pull, or review `push --dry-run`. Resolution changes only the selected path's baseline; it never silently overwrites other conflicts. Accepting a remote deletion also requires `--allow-delete`.

## Local state and recovery

| Location                     | Contents                                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| `.skillshare/config.json`    | Versioned binding: trusted server origin, Harness UUID, selected runtime profiles                  |
| `.skillshare/lock.json`      | Exact installed release ID/version, revision, tree checksum, selected file checksums               |
| `.skillshare/local/`         | Ignored baseline, pending idempotent push, recovery journal, Windows mode metadata, operation lock |
| User configuration directory | Account identity and selected credential storage; never inside native files                        |

Credentials default to `--storage auto`: setup first checks the optional OS keyring adapter, then uses Windows DPAPI encryption if the adapter is absent or unusable on Windows. DPAPI binds encrypted credentials to the current Windows user, with per-account context and restricted credential-directory permissions. Tokens travel to the Windows helper through stdin, never command-line arguments. Explicit `--storage dpapi` works without the native keyring package. Linux requires persistent Secret Service storage; other platforms require a working keyring or explicit file storage.

`--storage file` is an explicit plaintext alternative with owner-only permissions and a restricted Windows directory ACL. It is never chosen automatically. Storage checks happen before a device grant or browser approval. In this workspace, `npm install --include=optional` can install the missing native adapter when registry access is available. Existing keyring and file accounts retain their selected storage during refresh. Set `SKILLSHARE_CONFIG_DIR` only when deliberately choosing another user configuration directory outside a shared codebase.

Refresh tokens rotate; refresh is serialized within a process and by an account file lock across processes. Browser cookies cannot refresh CLI sessions, and CLI refresh tokens cannot refresh browser sessions. `auth logout` revokes the current credential; the browser's **Connected devices** page can revoke an individual CLI session.

Local mutations use an exclusive operation lock. If a process crashed, confirm it has stopped before removing the named stale lock. Run `sks recover` when a pull journal exists. Recovery preserves edits made after the interruption and reports any file requiring manual recovery. Never commit recovery backups or credential files.

The scanner rejects symlinks/junctions, traversal, binary/non-UTF-8 files, oversized files/trees, and likely literal credentials. Personal/runtime state and unrelated GitHub workflows are excluded. Use environment variable references for secret configuration; the detector is a protective check, not proof that a file contains no secret.

## Working history and backend

Migration `007-cli-sync.sql` records immutable whole-tree working snapshots, CLI sessions, device grants, and idempotent changesets. Existing Harness drafts receive one honest migration snapshot; earlier drafts cannot be reconstructed. Existing published releases remain unchanged.

Web saves and CLI pushes create working revisions. No-op saves do not create revisions. The **History** page compares two snapshots and previews affected draft paths before restoration. Restoration uses the reviewed current revision and creates a new draft; a concurrent edit returns a conflict.

CLI changesets lock the current draft, verify ownership/profile paths, check the expected revision, and apply only selected paths. Request IDs make a retried push safe after a lost response. API access still requires current database-backed sessions and normal Harness authorization; scopes do not grant ownership.

## npm publication

The package is [@skillsync/cli](https://www.npmjs.com/package/@skillsync/cli). Publication requires your npm account to have publishing permission in the `skillsync` organization. The workspace and publishing scripts use this scope. The publisher confirmed initial publication of `0.1.1` on 2026-10-02; registry access from this development environment remains restricted.

```sh
npm login
npm run cli:check
npm run cli:pack
npm run cli:publish:dry-run
npm run cli:publish
```

The scoped package has `publishConfig.access = public` and targets the npm registry. `prepublishOnly` runs type checks and tests; `prepack` builds the executable. Publication requires npm account access and any required two-factor authentication. Keep credentials in npm's supported local/authentication mechanism; do not paste tokens into project source or chat.

For token-based publishing on Windows, use:

```powershell
npm run cli:publish:token
# Optional packaging preview; this does not verify registry authorization:
npm run cli:publish:token -- -DryRun
```

The helper prompts for a token with hidden input, checks the token's identity using `npm whoami`, runs the existing publication checks, and removes its temporary npm configuration on success or failure. Failed authentication stops before packaging or publishing. Identity confirmation does not establish publishing permission. Dry runs skip the identity request. The configuration contains only a registry-scoped environment-variable placeholder; the credential is passed to npm in the child process environment. Your normal user npm configuration remains unchanged. This npm credential is separate from a SkillShare CLI login.

If npm returns E403 mentioning 2FA, create a granular token with **Packages and scopes → Read and write (publish and stage)**, select the **@skillsync** scope, and enable **Bypass two-factor authentication**. Organization-management permissions alone do not permit publishing; stage-only tokens cannot publish directly. Your account must also have permission to publish under this scope. Check token expiration and IP restrictions. See [npm's access token instructions](https://docs.npmjs.com/creating-and-viewing-access-tokens/). Revoke any token shared in chat and enter its replacement only in the local prompt.

The helper's cleanup and failure paths can be checked without credentials or registry access using `powershell.exe -NoProfile -File scripts/test-publish-cli-token.ps1`.

If the publish **PUT** returns E404, check the namespace rather than attempting to install the unpublished package. The `skillsync` organization must exist on **npm** and the account printed by the helper must have publishing access (or `skillsync` must be that account's username). Choosing a name in this application or creating a GitHub organization does not register an npm scope. For a first package, grant the token publish permission for the **@skillsync scope**, since the package itself does not exist yet. See [npm's organization publishing guide](https://docs.npmjs.com/creating-and-publishing-an-organization-scoped-package/). A missing package during a lookup is expected before initial publication; failure of the actual publish PUT still needs resolution. If you do not control this namespace, choose one you own and update the package name and workspace scripts consistently; the `sks` executable name can stay unchanged.

For another version, change the package version before packing/publishing. npm versions are immutable. Configure trusted publishing/provenance after the repository and owned npm package are established.

## Current limits

Working history uses JSON snapshots, not deduplicated blob storage. One local codebase binds to one Harness. Editors and publishers have separate permissions, protected drafts use approved proposals, and browser consent can limit device sessions to selected Harnesses. `sks git import` creates a proposal from a local commit; `sks git export` creates a new local branch from an exact release. See [Git bridge and collaboration](git-collaboration.md). Native Git hosting, custom managed roots, content-addressed storage and live execution remain outside this release.

The optional native keyring adapter is configured but its binary integration has not been exercised in this restricted environment. Windows DPAPI encryption, credential rotation, tampering rejection, and file-storage compatibility are tested locally. Other operating systems need a distribution matrix before claiming full platform certification.
