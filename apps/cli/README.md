# SkillSync CLI

Sync native Claude Code, Gemini CLI, and Copilot configuration with a SkillShare Harness.

Package: **@skillsync/cli**. Short command: **sks**.

Install globally with **npm install -g @skillsync/cli**, then run **sks setup**. In a codebase, install with **npm install --save-dev @skillsync/cli** and use **npx sks**. To run without a local installation, use **npx --package=@skillsync/cli sks setup**.

Package page: [@skillsync/cli on npm](https://www.npmjs.com/package/@skillsync/cli). For development builds, install the locally packed **skillsync-cli-0.1.4.tgz** tarball instead.

Development workspace: **apps/cli**. From the repository root, use **npm run cli:check**, **npm run cli:pack**, **npm run cli:publish:dry-run**, and **npm run cli:publish**. Packing rebuilds the executable; publishing first checks types and tests. Public publication requires an npm account authorized for the package scope.

On Windows, **npm run cli:publish:token** securely prompts for an npm granular token. Select **Read and write (publish and stage)** for the **@skillsync** package scope and enable **Bypass 2FA**. Organization-management access alone is insufficient. The helper uses a temporary registry-scoped environment-variable configuration and cleans it up afterward. Do not share tokens in chat or commit them. See [npm's token documentation](https://docs.npmjs.com/creating-and-viewing-access-tokens/).

```sh
sks setup
sks push -p claude-code
sks add
sks add <harness-id> -p claude-code --link-only
sks push --dry-run
sks push -m "Update agent instructions"
sks pull --draft --dry-run
sks pull --draft --yes
sks publish
sks publish minor --notes "Updated instructions" -y
```

**publish** pushes your local changes first, then bumps the version from the latest release (patch by default; **minor**, **major**, or an explicit newer **X.Y.Z** also work; the first release is 1.0.0) and publishes it. In a terminal it asks for release notes (default "Release X.Y.Z") and confirms; scripts must pass **-y**. **--dry-run** previews the push and the version. If nothing changed since the latest release, it pushes but does not publish a duplicate.

**push** in a folder with no linked Harness offers to create one. In a terminal it asks for a name (default from package.json or the folder), runtime profiles (detected from **.claude**, **.gemini**, and **.github/agents|instructions|skills|hooks**), a description, and visibility (default private), then creates the Harness, links it, and pushes. Pass **-p NAME** (repeat or comma-separate; **claude**, **gemini**, and **copilot** are aliases), **--name**, **--description**, and **--visibility** to skip questions, or **-y** to accept every default without prompting, which also works in scripts. It refuses to create an empty Harness when the selected profile folder is missing. **--dry-run** shows what would be created and changes nothing. When a Harness is already linked, **-p** must match its profiles.

**add** with no ID, in a terminal, lists your Harnesses to link (link-only, keeping local files) or creates a new one. **init** asks for any missing name, description, or profile the same way.

For published content, use **add ID -p NAME --version 1.0.0 --yes**. Subsequent pulls stay on the installed release unless **--version** selects another release. **--draft** pulls the current owner draft.

Pull compares the remote files with the last synchronized baseline and local edits. Conflicts stop writes. Deletions require **--allow-delete**. Native MCP/hook/permission files are previewed and require **--yes** for local application. Imported commands are never executed by this CLI.

Inspect conflicts with **diff**, then use **resolve PATH --keep local|remote --draft --yes** (or the same **--version** as your pull). Retry the pull or review the retained change with **push --dry-run**. Resolution never discards another file's conflict.

Commit **.skillshare/config.json**, **.skillshare/base.json**, and **.skillshare/lock.json** alongside native files. The tracked base contains the exact per-path comparison snapshot, revision, profiles, and checksum, so clones and Git branches do not depend on ignored machine state. It can represent a mixed baseline when remote-only changes are still pending; the revision is the last observed remote revision, not a claim that all baseline paths came from that revision. The lock distinguishes the target release, remote/selected checksums, installed checksum, baseline checksum, and local divergence. Windows clones retain executable intent through tracked mode hints.

Pending push requests, cached remote manifests, native executable metadata, operation locks, and recovery journals live under ignored **.skillshare/local/**. **recover --dry-run** previews recovery; **recover** rolls back uncommitted files and metadata together or finalizes an already committed operation. Recovery can be retried after interruption and refuses to overwrite subsequent edits. Temporary replacements are flushed before rename; this does not promise filesystem-wide atomicity or power-loss protection on every filesystem.

For old repositories without a tracked base, an exact release pin can bootstrap comparisons in memory. If there is no pin, restore the original base from Git or use **repair --version 1.0.0 --dry-run**, then **repair --version 1.0.0 --yes** to explicitly adopt that immutable release as the base. Repair preserves native files. It never guesses that today's remote draft is the historical base. If no historical release exists, **repair --from-local --dry-run**, then **repair --from-local --yes**, explicitly adopts the current local native tree as the comparison base and previews incoming remote differences. This is a deliberate recovery choice, not a reconstructed historical revision. Older journals without metadata backups restore files, retain a local backup, and require this explicit repair before further synchronization.

**status --offline** and **diff --offline** use the last fetched remote snapshot and display its timestamp. Run an online status first. Offline results can be stale and cannot push or pull.

Raw text is preserved by default. If Git checkout conversion alone produces CRLF/LF conflicts, preview **pull --draft --dry-run --ignore-crlf**, then apply with **--yes --ignore-crlf**. This explicit policy treats LF and CRLF as equivalent for comparison; changed incoming files retain the remote line endings. It does not perform an arbitrary text merge or rewrite unchanged files.

Release names use stable **X.Y.Z** numbers without leading zeros. Prereleases/build metadata are not supported. **latest** means the highest stable version, so publishing a lower backport does not replace it. Exact versions and release IDs remain selectable. **publish X.Y.Z --notes TEXT --dry-run** checks and lists every remote file, including unselected profiles. Final publication sends the reviewed revision and checksum; the API applies the same safety policy to browser and CLI publications. Previews may refresh authentication credentials but do not change native content, synchronization metadata, or publish a release.

All commands reject unsupported flags; **add** and **init** bind their selected directory, even inside a parent bound repository. Native temporary files named **.skillshare-write-UUID.tmp** are reserved and excluded from sync. If a process is forcibly terminated before cleanup, an excluded temporary file can remain on disk.

Browser authorization uses an independent CLI session. Setup checks storage before browser approval. The default **--storage auto** prefers a working OS keyring and uses Windows DPAPI when the optional keyring is missing or unavailable. DPAPI files are encrypted for your Windows account, with secrets passed through stdin rather than command arguments. Linux requires a persistent Secret Service store; other platforms require a working native keyring or an explicit **--storage file** selection. **--storage dpapi** selects encrypted Windows storage directly. Plain **--storage file** uses restricted user-level credential files and is never selected automatically. Tokens are never written into native files or the repository. Use **auth status**, **auth logout**, and the browser's **Connected devices** page to inspect or revoke sessions.

If you explicitly request **--storage keyring** and the optional adapter is missing in this workspace, run **npm install --include=optional** in the repository root. Alternatively run **npx sks setup --storage dpapi** on Windows or explicitly use **--storage file**. Unavailable storage is reported before creating an authorization request.

**init [--name NAME] [--description TEXT] [-p NAME]** creates a Harness (private by default) for existing local files; outside a terminal without **-y**, name and description are required. Runtime profiles can be repeated. One codebase binds to one Harness; references outside the managed native roots, binaries, symlinks/junctions, and secret/local-state files are excluded or rejected.

Use **--help** for the full command list. Node.js 22.12 or newer is required.

Windows retains imported executable flags in ignored local metadata; POSIX systems apply them to files. Interrupted commands may leave an operation lock. Confirm the previous process stopped before removing the named lock, then use **recover** if a pull journal exists.

This release uses one Harness per codebase. Owners and editors can change unprotected drafts; owners and publishers can release them. Protected drafts accept approved browser-reviewed proposals. Administrators have no implicit Harness editing rights. Browser CLI approval can restrict the session to selected Harness IDs; action scopes and current membership also apply.

Git bridge (Git must be installed; run from the Git worktree root):

```sh
sks git import --ref HEAD --dry-run
sks git import --ref HEAD -m "Improve native agents" --yes
sks git export --version 1.2.0 --branch skillsync/release-1.2 --dry-run
sks git export --version 1.2.0 --branch skillsync/release-1.2 --yes
```

Import reads committed native files into a proposal; it leaves the saved draft and local files unchanged. Review/approve/merge in the Harness's **Changes & access** page. Export creates a new local branch from an immutable release, with a pinned binding/base/lock, and preserves your working tree, checked-out branch, and real index. The branch must be new and start with `skillsync/`. Deletions require `--allow-delete` after review. Use ordinary Git to inspect or push the new branch. Harness releases remain authoritative; SkillShare does not host Git transport endpoints. No hooks, filters, MCP processes or imported scripts are executed.
