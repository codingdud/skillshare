# Git bridge and Harness collaboration

Implemented on October 3, 2026. This supersedes the collaboration deferrals in the earlier [engine audit](sync-version-engine-audit.md) and [fix report](sync-version-engine-fixes.md).

## Content authority

PostgreSQL Harness revisions and releases remain authoritative. A Git repository is an import/export boundary, not a second writable release store. Existing revision IDs, exact release links, native paths, checksums, and CLI bindings remain valid. Historical snapshots are not rewritten or assigned invented Git ancestors.

The application does not host Git clone/fetch/push endpoints. Developers keep their existing Git remotes. `sks git import` reads an exact local commit and submits a proposal; `sks git export` creates a new local branch from an immutable Harness release. Ordinary Git can publish that branch after review.

This is the bridge approach from the audit: no hosted Git migration or arbitrary remote repository fetching. Git object IDs supplied with proposals are contributor attribution, not a claim of server-verified signatures or repository ownership.

## Permissions

Harness membership is independent of the account's `user`/`admin` role. An administrator has no implicit content-editing rights.

| Capability                                | Owner | Editor | Publisher | Viewer              |
| ----------------------------------------- | ----- | ------ | --------- | ------------------- |
| Read permitted releases                   | Yes   | Yes    | Yes       | Yes                 |
| Read draft and working history            | Yes   | Yes    | Yes       | No                  |
| Edit draft / CLI push / restore           | Yes   | Yes    | No        | No                  |
| Propose changes                           | Yes   | Yes    | Yes       | Yes, from a release |
| Approve another person's proposal / merge | Yes   | No     | Yes       | No                  |
| Publish an immutable release              | Yes   | No     | Yes       | No                  |
| Change membership or draft protection     | Yes   | No     | No        | No                  |

Signed-in visitors may propose changes to public Harnesses using a published base. Viewers and public contributors can see only their own proposals; private draft snapshots from other contributors do not become visible through proposal endpoints. Staff can see the Harness's proposals. Membership changes take effect on the next request; manifests intersect Harness capabilities with the actual CLI action scopes.

The owner can enable **Require approved change proposals** in **Changes & access**. This blocks direct saves, CLI changesets and restoration for everyone, including the owner. Publishing the existing draft remains a separate owner/publisher action. Existing Harnesses default to direct editing to preserve compatibility. A protected Harness needs another owner/publisher to approve owner-authored changes; the UI never silently relaxes protection.

All content, policy and membership mutations lock the Harness row first, then check the current membership inside the transaction. Role revocation cannot race a write authorized against an earlier membership snapshot.

## Proposal lifecycle

1. Open **Changes & access → Propose changes**, or import a local Git commit.
2. Edit files in Monaco, add/delete native files, and review differences. Local proposals are retained in the browser tab's session storage; the saved Harness is untouched.
3. Submit a title, explanation, exact base revision, and full proposed snapshot. Shared validation enforces portable paths, text limits and credential exclusions. Immutable proposal contents retain their tree checksum.
4. A different owner/publisher approves the displayed checksum. A CLI token cannot approve, merge, change policy, or manage members: those operations require a browser session.
5. Merge requires the displayed head revision to equal the proposal base, and a matching approval from someone who still has owner/publisher authority. It creates one immutable working revision and marks the proposal merged in the same transaction.
6. Publish separately after reviewing the complete saved draft. Existing releases never change.

An old proposal never replaces newer draft files. **Update against current draft** starts a new local proposal. File-level three-way comparison carries independent changes forward; conflicting paths require **Keep proposed file** or **Keep current draft**. The new submission has a new identity and no inherited approval. There is no automatic text-hunk merge. The earlier proposal remains inspectable and can be closed explicitly.

Proposal lists currently show the 100 most recent visible entries. This limit is displayed; working revision history retains cursor pagination. Review comments are attached to each reviewer's active approval; this is not a discussion/issue tracking system.

Opening a proposal records its immutable ID in the browser URL (`/harnesses/ID/changes?proposal=PROPOSAL_ID`). These links remain usable for older proposals outside the list limit, subject to current access permissions. Git import prints the exact proposal link.

## CLI use

The local build is `@skillsync/cli` **0.1.4**, executable **sks**. Git must be installed. Run from the Git worktree root after authenticating and binding the Harness. Supported profiles and existing push/pull remain unchanged.

```sh
sks setup
sks add HARNESS_ID --profile claude-code --link-only

# Import committed bytes, not unsaved editor changes.
sks git import --ref HEAD --dry-run
sks git import --ref HEAD -m "Improve review agent" --notes "Add a human review step" --yes

# Export an exact release into a new branch.
sks git export --version 1.2.0 --branch skillsync/release-1.2 --dry-run
sks git export --version 1.2.0 --branch skillsync/release-1.2 --yes
git diff HEAD...skillsync/release-1.2
```

Import replaces the selected profiles in a proposal and preserves unselected Harness files. Deletions require `--allow-delete`; empty native imports are rejected. A viewer uses the latest release as the base, never an unpublished draft. Git import does not advance the local synchronization base or change native files.

Export reads the chosen release, preserves application files in the base Git commit, and updates native files for the selected profiles. It writes `.skillshare/config.json`, `base.json`, and `lock.json` into the new branch so clones have an exact release binding and executable-mode hints. It does not write ignored machine-local state or credentials. The working tree, checked-out branch, and real index are untouched. The branch must start with `skillsync/` and must not already exist. Ref creation compares against an absent ref, preventing accidental replacement. Use `--ref` to select an existing local base commit. `--allow-delete` is required for native removals. Dry-run makes no Git object/ref writes and no proposal POST.

Exports use the developer's Git name/email, and create ordinary unsigned commits. Existing branch changes and remote pushing remain explicit Git operations. A failed export before ref creation can leave unreachable objects for normal Git garbage collection; it never moves an existing ref.

Raw object reads avoid checkout filters and line-ending conversion. Native symlinks/submodules, invalid UTF-8, unsafe paths and oversized text are rejected. Git commands use argument arrays, a bounded timeout/output limit, no replace refs or inherited Git location/config environment overrides, and no repository-configured lazy fetching. Imported hooks and MCP processes are never executed. Export uses an isolated temporary index and plumbing commands, with no checkout or commit hooks.

Implementation follows Git's [untrusted revision verification guidance](https://git-scm.com/docs/git-rev-parse), [raw blob reads](https://git-scm.com/docs/git-cat-file), [raw hashing](https://git-scm.com/docs/git-hash-object), [commit creation](https://git-scm.com/docs/git-commit-tree), and [expected-old ref updates](https://git-scm.com/docs/git-update-ref). Current Git documentation was retrieved with Context7 before implementation.

## Device grants

Browser approval can restrict a CLI session to up to 100 selected Harness IDs. The restriction persists in the session through rotating refresh credentials. Action scopes and current membership still apply; a selected ID grants no ownership or publishing privilege. A restricted session cannot enumerate unrelated Harnesses, create a new Harness, or use another Harness's endpoints. Reauthorize to expand the selection. Connected devices displays the selection and supports whole-session revocation. Account-wide grants remain an explicit available option, including future permitted memberships; existing sessions retain that behavior.

## Migration and operation

Run `npm run db:migrate` before starting the updated API. Migration `011-harness-collaboration` adds draft protection, immutable proposal snapshots, reviews and selected device grants. The API refuses startup without the proposal table. Existing releases/revisions and viewer invitations are retained. No old test Harnesses or user data are deleted.

Rebuild web/API/CLI together because the frontend now uses server-provided capabilities. Distribution uses the normal CLI build/test/pack workflow; the 0.1.3 tarball is prepared locally. npm registry publication is a separate operation.

Validation includes HTTP integration tests for each role, denied admin override, protection, exact review checksum, self-review, revoked reviewer authority, stale merges, privacy and restricted grant refresh. Real Git tests exercise committed CRLF bytes, executable modes, dirty-worktree preservation, isolated index export, branch compare-and-swap, symlink rejection, previews and checksums. Browser tests exercise Monaco proposal editing, publisher review/merge, and the built CLI against the running API.

Native Git hosting, server branch protection, signed source verification, contribution discussions, content-addressed storage and cross-platform power-loss testing remain separate work. No deduplication or transport benchmark is claimed by this change.

## Validation record

All four TypeScript packages and the web/API/CLI builds pass. The combined suite passes 108 unit/integration tests with one existing skip. Four browser journeys pass, including real CLI Git import/export and protected proposal publication; the proposal journey also verifies conflict resolution preserves independently added files and clears inherited approvals. Migration 011 is applied locally, the updated API is running, and CLI 0.1.3 is packed locally with the expected four distribution files. The pre-existing Monaco bundle-size warning remains.

The bridge also rejects existing symbolic branch names, uses non-dereferencing expected-old ref updates, disables filesystem-monitor and Git index/commit hooks, and blocks all transport protocols while inspecting local objects. This transport block protects older Git versions that do not understand `--no-lazy-fetch`. These controls follow the documented [Git environment and protocol rules](https://git-scm.com/docs/git#Documentation/git.txt-GITALLOWPROTOCOL); they do not turn an arbitrary untrusted `.git` directory into a general-purpose sandbox.
