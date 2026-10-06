# SkillShare

SkillShare helps people discover native AI agent files, create attributed variants, and share versioned Harness repositories. The workspace contains a React + TypeScript frontend, layered Express API, PostgreSQL schema and local Mailpit inbox.

The [CLI app](apps/cli/README.md) implements browser authentication, local Harness bindings, native file push/pull, and revision history. Install with `npm install -g @skillsync/cli`, then run `sks setup`. In a codebase, use `npm install --save-dev @skillsync/cli` and `npx sks`. See [build, test, package, and publishing instructions](docs/cli.md).

## Start with PostgreSQL and the local email inbox

Requirements: Docker Desktop and Node.js 22.12 or newer (the repository includes a local Node 24 runtime for npm scripts).

```sh
npm install
npm run setup:postgres
npm run dev
```

Open `http://localhost:5173`. The API runs at port 4000. PostgreSQL runs on `localhost:55432`. Local verification and password recovery emails appear at `http://localhost:18025`.

On subsequent starts, keep Docker Desktop running and run `docker compose up -d --wait` before `npm run dev`. The API checks database connectivity and the schema before listening; the frontend waits for API health before starting. If the API reports a missing schema, run `npm run db:migrate`. Database connection failures return 503 with error codes in server logs. The frontend proxy uses `127.0.0.1:4000` to avoid localhost address ambiguity.

After running `npm run db:seed`, sign in with the local demo account `demo@skillshare.test` / `SkillShare-Demo-2026!`. The login screen provides a development-only button to fill these credentials. The seed command refuses to run with `NODE_ENV=production`.

`npm run setup:postgres` generates local database credentials and stores them in ignored `.env` files. It does not overwrite existing configuration secrets. Use `npm run db:migrate` and `npm run db:seed` after schema or sample-catalog changes. PostgreSQL data persists in a Docker volume.

For a database without Docker, `npm run setup` configures persistent PGlite storage under `.local`.

## Gmail SMTP

Open `apps/api/.env` in a text editor and set the sender to the Gmail address you own:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-address@gmail.com
SMTP_PASS=your-16-character-google-app-password
MAIL_FROM=SkillShare <your-address@gmail.com>
```

Create an app password in the sender's Google Account security settings. Paste it directly into the local `.env` file; never put it in chat, source files, or a public repository. Restart the API after editing these settings. In production, use a dedicated mail provider and store the password in your deployment's secret manager.

## Authentication routes

`POST /api/auth/register` creates an unverified account and emails a six-digit code. `POST /api/auth/verify-email` validates that single-use code before creating a session. Login requires verified email. Password recovery uses `POST /api/auth/forgot-password`, `POST /api/auth/verify-password-reset`, and `POST /api/auth/reset-password`. Reset tickets are short-lived, single-use, and revoke all active sessions.

Codes expire after 10 minutes, permit at most five attempts, and can be resent once per minute. Refresh credentials are rotated in HttpOnly cookies. Access tokens remain in memory.

`POST /api/auth/session` restores the session at page load. It rotates an existing refresh cookie or returns `200` with `null` for a signed-out or expired session. `POST /api/auth/refresh` remains protected and returns 401 for invalid credentials; the Axios interceptor shares a single refresh across pending authenticated requests.

## Harness repositories

Create a Harness from a single agent file or import a native configuration folder. Preserve the original paths, then edit agents, skills, hooks, instructions, and settings together in one Monaco workspace. Drafts autosave with revision checks; publishing creates one immutable release for the complete file tree. A single uploaded Markdown file asks for its destination path, with .claude/agents/ suggested.

The editor supports file/folder import, create and rename, deletion with undo, private/public/team releases, and viewer invitations. **Add native files** offers reviewed agent, skill, MCP, pre/post hook, and settings templates for Claude Code, Gemini CLI, and Copilot runtime profiles. Existing settings are patched without replacing unrelated keys or comments; duplicate MCP server names are rejected. The component inspector links directly to native files, and configuration diagnostics appear in Monaco. Invalid configuration can be saved as a draft but blocks publication in both the UI and API. SkillShare does not execute imported commands or establish connections.

Use **New skill** to create a native skill folder with an editable `SKILL.md`. Template files open in **Edit files**; switch to **Review changes** before applying them to the draft. **MCP configuration** opens the existing configuration directly, including malformed JSON that needs repair. The explorer supports right-click New file/New folder/Rename/Delete, file tabs, F2 rename, and Ctrl/Cmd+S. Empty folders use a `.gitkeep` file. On a published release, owners can select **Edit draft** to return to the editable workspace.

Select a release in the editor header to inspect its immutable tree, copy an exact-version link, or download a ZIP with original paths and source text. Public visitors get read-only release files; owners edit drafts. Save failures retain local edits and offer retry, comparison with the latest draft, and a local draft download. ZIP import, Git synchronization, semantic search, workflow-to-file generation, and repository contributions remain planned.

The editor fills the available viewport and scrolls long files inside Monaco. **Expand editor** hides the global navigation; **Restore layout** brings it back. Editable files have a delete icon on the right of their explorer row, with Undo after deletion. Read-only releases do not show delete controls.

Open **My Harnesses** in the sidebar, choose **New Harness**, then add files or a folder. Review and publish from the editor header. See the [Harness repository redesign and migration plan](docs/harness-repository-plan.md). Standalone project/asset pages and APIs have been removed. Explore groups published Harnesses and derives native component results from their immutable release files. Saved and Activity also use Harnesses. See [Harness-only retirement](docs/harness-only.md) for migration and archived history.

## Creator profiles

Click your account card in the sidebar or open the avatar menu and choose **Your profile** to see your public Harnesses, releases, and native-file totals. You can also open `/profile` directly; signing in preserves that destination. `/users/me` redirects to your own profile. **Edit profile** updates your display name, bio, company/team, location, website, and GitHub username, with a live preview. Profile changes appear in creator attribution across Explore and Harness pages. Share `/users/<user-id>` as your stable public profile URL.

Email and verification status are excluded from public profiles. Account owners see them in their profile; administrators see account metadata in the protected user directory. Private/team Harnesses and unpublished drafts are excluded from public lists and counts. Edits use a revision check; conflicting changes preserve your form and offer **Use latest profile** or **Keep my edits** after comparison. Run `npm run db:migrate` when updating an existing installation to apply `008-user-profiles`.

The layered users module provides public `GET /api/users/:id`, browser-only `GET /api/users/me`, and browser-only `PATCH /api/users/me`. Public Harness lists use stable pagination and link to exact releases.

## Platform administration

Visit `/admin` or choose **Administration** in the account menu. Only browser sessions belonging to a database `admin` can access the dashboard or `/api/admin/*`. Every new account defaults to `user`; registration and profile updates cannot grant a role. Removing admin access takes effect on existing access tokens immediately. Roles grant platform administration separately from Harness ownership and membership; administrators do not automatically receive private file access.

Run `npm run db:migrate` to apply `009-admin-roles`, then `npm run db:seed` for development credentials:

- Admin: `admin@skillshare.test` / `SkillShare-Admin-2026!`
- User: `demo@skillshare.test` / `SkillShare-Demo-2026!`

The development seed refuses production. For production, register and verify an account normally, then run `npm run admin:grant -- user@example.com` on the trusted API host with its database configuration. This operator command grants only the specified existing, verified account access and records an audit event. Further role changes are available in **Users** with confirmation, revision checks, self-demotion protection, and protection for the last admin.

The dashboard includes totals and daily contributions, searchable/paginated accounts and Harness metadata, filtered activity, and API/database monitoring. Audit records cover browser login/logout, profile updates, role changes, and denied admin access from this rollout onward. Historical registration, Harness revisions, and releases come from their existing records. Audit events contain summaries and identifiers, never tokens, passwords, or file content. Monitoring reports this API process's completed request counts, memory, uptime, average latency, and the latest 2,000 responses' p95; counters reset on restart. It is not distributed infrastructure or email monitoring.

Checks for administration: `npm test` and `npm exec -- playwright test e2e/admin.spec.ts`.

## Validation

See the [original push/pull audit](docs/sync-version-engine-audit.md) and the [implemented fixes and validation](docs/sync-version-engine-fixes.md) for Git compatibility, recovery, version policy and remaining architecture decisions.

Team roles, protected draft changes, Monaco change proposals, selected Harness CLI grants, and Git import/export are implemented. Open **Changes & access** from a Harness. See the [Git bridge and collaboration guide](docs/git-collaboration.md) for permissions, review/merge behavior, migration 011, and CLI commands.

Run npm run typecheck, npm run build, npm test, and npm exec -- playwright test from the repository root.

The Harness API is under /api/harnesses, including native discovery, bookmarks, activity, revision-aware drafts, members, immutable working revisions, CLI manifests, and conditional changesets. Migration 006 archives retired asset tables; migration 007 adds device authorization, CLI session metadata, immutable revisions, and idempotent changesets. Browser tests cover discovery, native editing, publishing, downloads, mobile layout, and browser-authorized CLI push/pull. Run the checks against your current checkout.

```sh
npm run typecheck
npm run build
npm test
npm exec -- playwright test
```

The end-to-end browser flow reads test-only codes from the local Mailpit inbox. It must never be pointed at a production database or sender mailbox.
