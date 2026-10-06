# Sync and version engine fixes

Date: 2026-10-03. Follow-up to [the original audit](sync-version-engine-audit.md). CLI package: `@skillsync/cli` 0.1.2. The existing HTTP synchronization engine remains the content authority.

## Confirmed findings resolved

| Finding                                       | Implemented behavior                                                                                                                                                                                                                                                            | Regression evidence                                                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| B1: clones lose the baseline                  | A checked, tracked `.skillshare/base.json` carries the exact per-path comparison snapshot and selected profiles. Missing machine state does not prevent comparisons. Old exact release pins can bootstrap in memory. Explicit `repair` handles an unpinned or damaged baseline. | CLI unit tests; actual Git clone and detached worktree in `e2e/cli.spec.ts`                                            |
| B2: replay conflicts with later edits         | Pending requests record their binding and validated request. An acknowledged upsert/removal advances that path's base regardless of subsequent local edits. Unrelated remote changes remain pending. Authentication failures retain the request for recovery.                   | Lost response, edit B to C, replay B, then push C; backend replay after a newer server revision                        |
| B3: recovery mixes old files and new metadata | Journals capture binding, operation UUID, original files and modes, and before/after configuration, tracked base, state and lock bytes. Metadata intent is persisted before replacement. Uncommitted operations roll back; committed operations finalize.                       | Faults after base/state/lock replacement and at the committed marker                                                   |
| B4: impossible and nonportable trees          | Shared validation rejects ancestor-file collisions, case/NFC collisions, invalid Unicode, traversal, Windows reserved names, unsafe characters and oversized path segments. Limits use UTF-8 bytes.                                                                             | Shared contract tests and HTTP boundary tests                                                                          |
| B5: leading-zero releases                     | CLI, browser and API share stable X.Y.Z validation. Leading zeros, prereleases and build metadata are rejected for new releases. Existing exact release identities remain accessible.                                                                                           | Contract and HTTP validation; numeric ordering and patch bump beyond JavaScript Number precision                       |
| B6: recovery cannot resume                    | Recovery accepts original bytes as an already-restored state, journals rollback progress and in-progress mode restoration, and refuses divergent file or metadata edits.                                                                                                        | Interruption after native replacement, partial executable update, file restoration and metadata restoration            |
| B7: dry-run writes                            | Publish validates and lists the complete snapshot without posting a release; recover and repair preview without changing native files or sync metadata. Unsupported and mutually exclusive flags fail before work. Previews do not create a missing root directory.             | Actual built CLI subprocesses against a disposable HTTP server; zero publication requests and unchanged native content |
| B8: publication policy differs                | Browser and CLI publication use the same server-side shareability guard on the entire snapshot, including unselected profiles and supporting files. Private drafts remain editable. Errors identify paths without printing matched credential values.                           | HTTP publication tests for browser and CLI, plus frontend/backend publish flow                                         |
| G1: lock implies an exact installation        | Lock v2 distinguishes target release, remote and selected tree checksums, installed tree checksum, comparison-base checksum, profiles and divergence. Status describes local divergence explicitly. Windows clone mode hints travel in the tracked lock/base.                   | Local variant retained through pull; installed checksum differs from selected remote checksum                          |
| G2: CRLF conversion causes conflicts          | Raw content is preserved by default. Explicit `--ignore-crlf` makes CRLF/LF equivalent during comparison and preserves remote endings for applied changes. No arbitrary text merge is implied.                                                                                  | Contract and CLI tests for conversion-only local changes with a remote edit                                            |
| G3: legal text exceeds transport size         | A Harness request receives a 36,000,000-byte JSON limit, sufficient for escaped content plus upsert/removal paths within the shared limits. Other JSON routes retain a smaller 1 MB limit. Oversized requests return 413.                                                       | HTTP test accepting a valid 5 MB text tree whose JSON exceeds the previous limit; worst escaping contract test         |

## Further engine improvements

- Revision history uses a bounded integer cursor instead of an inaccessible 100-row cutoff. The browser loads older revisions without resetting the selected comparison. Tests cover insertion of a new head between pages and a browser journey past 50 revisions.
- `latest` means the highest stable version across manifest selection, repository previews, discovery and the release selector. Publishing a lower backport does not replace it. Exact release IDs remain pinned.
- Tree serialization is shared and labeled `sha256-tree-v1`; existing checksums retain their byte format. Manifests, bindings, baseline snapshots, current/legacy locks, pending requests, caches and journals have checked schemas.
- Migration `010-sync-integrity` adds stored checksums, same-Harness parent/reference constraints and release-to-revision references. Database triggers prevent updates to immutable content. Historical published snapshots are retained where working history was missing; migration never fabricates intervening drafts or authors.
- Push receipts reference the retained acknowledged revision instead of duplicating its files. Replays reconstruct the exact original response, even after later edits. Eligible historical receipts are compacted during migration.
- CLI and browser publication send a reviewed revision and tree checksum. CLI preview inspects every profile and lists every file. The browser review lists the complete release contents.
- `status --offline` and `diff --offline` show the age of the cached remote snapshot and make no network requests. Mutation commands reject `--offline`.
- Native and metadata writes use flushed sibling temporary files followed by replacement. Windows replacement retries transient sharing errors without deleting the destination. Reserved temporary names are excluded from sync.
- Pull checks only touched native paths before replacement, rather than scanning the entire tree for every change. Baseline reconciliation uses maps.
- Manifest write/publish capabilities intersect ownership with the CLI token's actual scopes. Server authorization remains authoritative.
- `add` and `init` use the explicitly selected directory rather than accidentally inheriting a parent Harness binding. Init checks the binding and operation lock before creating a remote Harness, avoiding an orphan when the directory is already bound. Startup checks require migration 010 before the API begins accepting requests.

## Compatibility and recovery

Commit `.skillshare/config.json`, `.skillshare/base.json`, and `.skillshare/lock.json` with the native tree. The base contains exact content because a partially reconciled tree can have different historical comparison values for different paths. Its revision records the last observed remote revision; it does not assert that every path came from that one revision. This design is reconstructible after Git clone but duplicates text in the tracked baseline.

An old exact release pin is supported. An older journal without metadata backups cannot reliably reconstruct the prior baseline. Recovery restores its native files, retains a local backup and blocks subsequent synchronization until the user explicitly chooses a base:

```sh
sks repair --version 1.0.0 --dry-run
sks repair --version 1.0.0 --yes
```

If no historical release exists, deliberately adopt the current local tree after reviewing incoming differences:

```sh
sks repair --from-local --dry-run
sks repair --from-local --yes
```

Repair never changes native files. Adopting local content is an explicit recovery choice, not reconstructed history. Authentication refresh can update user-level credentials during a preview; release publication, native files and sync metadata remain unchanged.

## Validation

- Full unit/integration suite: **94 passed, one existing skipped**, across nine files.
- All four TypeScript packages pass type checking; frontend, API and CLI builds pass.
- Browser/native editor and publication tests: **two passed**. Expanded CLI/browser test: **one passed**, including real Git clone, separate worktree, pinned versions, conflict resolution and older history loading.
- Updated isolated audit scenarios: **ten passed**. Built CLI checks verify read-only publish/recover/repair previews and invalid flags.
- Migration applied successfully to the local PostgreSQL database. API restarted with the rebuilt application.
- CLI 0.1.2 is built and packaged locally; npm registry publication is a separate operation.

The original reproduction scripts now assert the corrected behavior. See `apps/cli/src/sync.test.ts`, `apps/cli/src/protocol.test.ts`, `apps/api/src/integration.test.ts`, `e2e/cli.spec.ts` and `scripts/audits/`.

## Remaining architecture decisions and validation boundaries

**Follow-up implemented October 3:** the [Git bridge and collaboration guide](git-collaboration.md) supersedes the first two deferrals below for team roles, proposals, protected drafts, selected device grants and local Git import/export. Native Git hosting remains outside this implementation. The validation counts above describe the earlier engine-fix milestone.

These items are not silently represented as completed features:

- Native Git transport, remote branches, merge ancestry, contribution proposals and protected refs require the larger Git architecture decision described in the original report. Git clone/worktree compatibility of tracked Harness files does not make the HTTP engine a Git server.
- Team editors/publishers and per-Harness device grants remain separate authorization/product work. Current draft writes are owner-only; viewer access and CLI action scopes remain enforced.
- Full snapshots and tracked bases still duplicate content. Compact receipts reduce one source of duplication; content-addressed blobs, immutable journal-plan/progress separation, retention and transfer compression need measurements before a storage migration. No latency or storage benchmark target is claimed as achieved.
- Multi-file consistency is journal-based. Flushed per-file replacement is not a promise of power-loss durability on every filesystem. Directory-entry durability, actual process-kill testing, network filesystems and Linux/macOS keyrings/permissions need platform testing.
- Files are checked immediately before writes and symlinks/junctions are refused. Uncoordinated external writers can still race the final check; the operation lock coordinates CLI processes, not all editors or Git checkouts.
- Arbitrary external resources, binaries, local secrets and runtime state are not automatically imported. Any broader resource selection requires explicit review and access boundaries.
- Credential detection is conservative pattern checking, not a comprehensive secret scanner. Interrupted token rotation remains an authentication boundary; replay protection was not weakened.
- A forced process exit may leave an excluded sibling temporary file or operation lock. Confirm the prior process stopped before removing a lock, then use recovery. Existing unsafe snapshots can be inspected or downloaded by exact identity but must meet the new rules before publication/sync.
