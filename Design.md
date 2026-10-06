# SkillShare — product and implementation reference

> **Current model:** Harness is the only editable and shareable repository. Standalone asset/project pages, creation, publication, and APIs are removed. Agents, skills, MCP, hooks, and settings are native files within a Harness. Explore derives results from authorized immutable Harness releases. Historical design sections below are superseded by [Harness-only retirement](docs/harness-only.md).

Implemented CLI: [apps/cli](apps/cli/README.md) supports browser device authorization, separate rotating CLI credentials, runtime bindings, reviewed push/pull, pinned releases, and immutable working history. See [operational and npm publishing instructions](docs/cli.md). The [research plan](docs/cli-sync-plan.md) also describes future storage, contribution, and organization enhancements beyond this first implementation.

## Product promise

Current collaboration: PostgreSQL Harness revisions/releases remain authoritative. Local Git commits can supply immutable change proposals, and exact releases can be exported into new local Git branches. `/harnesses/:id/changes` provides team roles, draft protection, Monaco proposal editing, checksum-bound reviews, merge, and conflict-aware preparation of a new proposal. Account roles do not grant Harness ownership. Browser device authorization supports selected Harness grants. See [Git bridge and collaboration](docs/git-collaboration.md); historical branch/contribution deferrals below are superseded by this implementation.

Platform administration is available at `/admin` to the separate `admin` account role. The dashboard uses Overview, Users, Harnesses, Activity log, and Monitoring sections. Account and inventory tables support URL filters and pagination; native file permissions remain ownership/membership based. The Users section confirms promotions/demotions, requires verified email for promotion, and preserves at least one administrator. Ordinary registration always assigns `user`. The API reads current roles from the database on every authenticated request rather than trusting a JWT role claim. Role edits use a distinct revision and transactional audit event. Overview charts include a plain daily-data table; monitoring describes process-local measurement and restart behavior. Public creator profiles expose neither roles nor account emails. Migration `009-admin-roles` adds account roles, role revisions, and administrative audit events. See [administration operation and credentials](README.md#platform-administration).

Creator profiles use `/users/:id` as a stable public identity and `/profile` for the signed-in account. Show public published Harnesses, release totals, current native-file totals, bio, location, company, website, and GitHub username. Private/team Harnesses and unpublished drafts do not contribute to public lists or statistics. Email and verification status are available to the account owner and the protected admin user directory, never public profiles. `/profile/edit` uses shared Zod validation, a live preview, and revision-aware updates that preserve edits and offer conflict recovery. The account menu links to the profile, profile editing, connected devices, sign-out, and administration for admins. Initials provide an avatar without introducing unsupported file uploads. Migration `008-user-profiles` adds editable metadata; authentication credentials and Harness access remain separate.

Discover useful agents and skills, adapt them, and share versioned work with clear attribution. The primary question on every variant is: **What changed, and is it right for my task?**

## Canonical model

Native asset implementation: see [native-assets.md](docs/native-assets.md) for researched platform formats, folder layouts, file editing, publication validation, and export behavior. Skills and agents can carry native file packages in their versioned content; agent subagents are pinned separately from skills. The native entry file is the instruction source of truth.

Project → Skills, Agents, Workflows, MCP, Hooks, Settings → immutable releases. Each asset belongs to one project. A variant is a new asset with its own owner and history, its immediate parent, original source, and exact source release. Tags describe an asset; they never establish identity. Branches and contribution proposals belong to the later collaboration stage.

## Implementation architecture

- npm workspaces: `apps/web`, `apps/api`, `packages/contracts`.
- Web: React, TypeScript, Vite, Tailwind CSS, Redux Toolkit, React Router, Axios.
- API: Express, TypeScript, PostgreSQL, Zod, jose JWT, Argon2 password hashes.
- Layer boundaries: routes → controllers → services → repositories → PostgreSQL. Shared contracts contain request validation and response types, not database or UI code.
- PostgreSQL is authoritative. Parameterized SQL, transaction boundaries, ownership checks, revision-aware draft saves, and immutable release snapshots are required.
- Initial search uses PostgreSQL full-text search and structured filters. Hybrid OpenSearch, isolated execution, automated evaluations, advanced moderation, and contribution branches are explicit later stages; the interface must not pretend these are operational.

## Authentication

Short-lived JWT access tokens are held in memory. Refresh credentials are random opaque tokens in HttpOnly, SameSite cookies; only their hashes are stored. Refresh tokens rotate transactionally, with family revocation on replay and logout. Access JWTs carry a session ID that the API checks for revocation. Sensitive responses are not cached. Cookie-changing endpoints validate the Origin. Production requires TLS, secure cookies, and explicit trusted origins.

Email registration requires a six-digit, ten-minute, single-use code. Password recovery uses the same single-use email code to grant a separate five-minute, one-use reset ticket. Both challenges are HMAC-hashed, limited to five verification attempts, rate-limited to one send per minute, and never logged. Resetting a password revokes every session. Public reset requests use a generic response. Axios uses one shared refresh promise as the queue for concurrent 401 responses. All waiting requests resume after refresh, each retries at most once, and all reject if refresh fails. Auth endpoints use a separate client to prevent recursive interception. Logout invalidates in-flight refresh results. Redux stores auth identity and UI/search state; secrets do not enter persistent browser storage.

## Navigation and screens

Global navigation: Explore, My projects, Saved, Activity, Organizations. Persistent project-aware Create action. Public discovery requires no authentication.

Explore uses task-led search, type tabs, stage filters, compact list results, explicit requirements, family grouping, and a matched-variant explanation. Search state belongs in the URL. Project pages expose purpose, contents, requirements, and releases. Asset pages expose Overview, Variants, Examples, Versions, and Reviews. Agent dependencies and workflow stages pin exact releases.

Variant detail places the source breadcrumb and plain-language difference summary near its name. Comparison defaults to differences, then instructions, requirements, and output contracts. Creating a variant copies reusable release content only. Source changes never overwrite it.

Creation uses a shared full-page shell with separate kind modules and relevant sections. Project Add asset offers Skill, Agent, Workflow, MCP server, Hooks, and Harness settings. A project owns every new asset. A draft remains editable, but each published snapshot is stable. Publishing validates dependency visibility and exact release references. Share links never change access. Team visibility is granted through explicit project membership.

## Visual foundation

Calm neutral canvas (#F8FAFC), white surfaces, slate text (#0F172A / #475569), indigo actions (#4338CA), subtle borders, 12px cards, system sans-serif. Desktop: 232px sidebar, 64px top bar, 24–32px gutters. Dense useful content, no decorative hero artwork. Icons always accompany readable labels. Use distinct treatments for type, version, tags, and status.

Mobile: collapsible global navigation, stacked detail and comparison, full-width editing. Persistent field labels, visible keyboard focus, native form semantics, touch-sized controls, reduced motion, live save/error messages, and no color-only change markers.

## Access and integrity rules

- Every read, search result, aggregate, release, and dependency lookup checks project access.
- Only owners can publish, grant membership, or edit their project assets in this first implementation.
- Public releases cannot contain private/team dependencies; team references require compatible access.
- Reviews are release-specific; maintainers cannot rate their own project assets; one active review per user per item.
- Ratings are independent of stars and never inherited by variants.
- Draft updates require the current revision number. Conflicts preserve local edits.
- Workflow configuration is inspectable; no execution or tool authorization is implied by adding it.

## Core API

`/api/auth`: register, login, refresh, logout, me.
`/api/projects`: discover, create, detail, membership, project release manifests.
`/api/assets`: discover/filter, create, detail, draft update, publish, variants, compare, releases, reviews, saves.
`/api/workspace`: owned assets/projects, saved assets, activity.
Errors use a consistent `{ error: { code, message, details? } }` shape. Paginated lists expose total and page metadata.

## Verification

Build and typecheck all workspaces. Test refresh concurrency and failure, backend token rotation/replay, unauthorized access, immutable releases, source attribution, review eligibility, dependency access, and draft conflicts. Exercise the public search → register → project → variant → publish → compare journey against a real database where available. Clearly report environmental limits and unimplemented later-stage capabilities.

## Delivery boundaries

The first release targets a functional sharing platform plus a configuration-only workflow composer. Live runs, external integrations, verified-use labels, semantic search, organization administration, and advanced contribution merging require later services. Email OTP verification and password recovery are implemented through configurable SMTP; native file change proposals are supported. No fabricated usage evidence or ratings should appear as real activity.

## Asset modules and harness profiles

See [asset-modules-plan.md](docs/asset-modules-plan.md) for the 2026-10-02 research, confirmed project Add asset routing defect, proposed separate asset editors, harness adapters, MCP/hooks/settings composition, migration strategy, and validation gates. The supported module editors, adapters, composition/export, and migrations are now implemented. See [asset-modules-implementation.md](docs/asset-modules-implementation.md) for usage, schema/API changes, validation evidence, and remaining runtime limits.

## Workflow composition update scope

Workflows now compose pinned skills, agents, MCP, settings, and hooks, with optional ordered skill/agent stages. Native hooks retain their precise trigger and scope; workflow/stage callbacks require a future executor. The wide builder supports source inspection, release changes, conflict review, and publication without fabricated prompt fields. Detail pages, comparison, variants, proposals, recipe/native exports, and exact project export plans use the same V2 composition. Legacy releases stay unchanged; conversion is explicit. See [workflow-composition-implementation.md](docs/workflow-composition-implementation.md) for usage, the shared schema/API, 105 unit/API and seven browser checks, and configuration-only execution limits. The approved [scope](docs/workflow-composition-scope.md) retains the research and acceptance criteria.

## Project-first creation update

The project is the creation and configuration workspace. Global Create leads to a project; skills, agents, MCP, settings, and hooks are component templates within the project file editor. Selecting a component opens its native files in Monaco. Search identity, pinned releases, source attribution, and format validation remain separate from the simplified creation navigation.

Workflow is an optional custom project builder, editable through guided selection or Monaco JSON. Its composition is stored on the project draft and snapshotted on project releases. Public custom project releases are reusable through attributed forks. Existing standalone workflow assets retain their history and compatibility editor/export; new creation uses the project subflow. See [project-first-creation.md](docs/project-first-creation.md) for the redundancy audit, usage, API, migration, and evidence.

## Harness MCP and hooks implementation

Use one repository editor for all native files. Add native files offers runtime-aware MCP and pre/post hook templates with a source comparison before applying. MCP definitions use .mcp.json, .vscode/mcp.json, or .gemini/settings.json as appropriate; hooks use Claude/Gemini settings or .github/hooks JSON. Existing settings and comments are preserved. The component inspector is derived from files, not separate mandatory asset records. Configuration errors appear in Monaco and block release publication in the UI and backend; drafts retain incomplete source. Published trees can be inspected read-only and downloaded with native paths.

The editor exposes **New skill** and **MCP configuration** directly. New templates start as editable Monaco files; **Review changes** shows their difference before application. Existing MCP files open directly even when their JSON is invalid. The explorer provides right-click creation, rename and deletion, inline path entry, searchable folders, and open-file tabs. Ctrl/Cmd+S saves the draft, F2 renames an explorer entry, and deletion offers undo. Owners viewing a release use **Edit draft** to resume editing. Controls respect read-only access.

Official references checked through Context7 and provider docs: [Claude hooks](https://code.claude.com/docs/en/hooks), [Gemini hooks](https://geminicli.com/docs/hooks/reference/), [Copilot hooks](https://docs.github.com/en/copilot/reference/hooks-reference), and [VS Code Local hooks](https://code.visualstudio.com/docs/agent-customization/hooks). VS Code Local and Copilot CLI/cloud sessions use different event and command formats; choose the intended runtime profile.
