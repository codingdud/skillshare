import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  harnessProposalSchema,
  harnessFilesSchema,
  compareSync,
  type SyncFile,
  type HarnessCapabilities,
} from '@skillshare/contracts';
import { api, errorMessage } from '../../lib/http';
import { useAppSelector } from '../../app/hooks';
import { ErrorBox, Field, Loading, PageTitle } from '../../components/ui';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { selectClass } from './harness-ui';

const Editor = lazy(() => import('../editor/SourceEditor'));
const Diff = lazy(() =>
  import('../editor/SourceEditor').then((m) => ({ default: m.SourceDiffEditor })),
);
type Harness = {
  name: string;
  revision: number;
  files: SyncFile[];
  capabilities: HarnessCapabilities;
};
type Proposal = {
  id: string;
  title: string;
  authorId: string;
  authorName: string;
  status: string;
  baseRevision: number;
  treeHash: string;
  source?: { commit: string };
  description: string;
};
type Details = Proposal & {
  files: SyncFile[];
  baseFiles: SyncFile[];
  reviews: { reviewerName: string; comment: string; valid: boolean }[];
};
type Member = { id: string; name: string; email: string; role: string };
type Draft = {
  title: string;
  description: string;
  revision: number;
  files: SyncFile[];
  baseFiles: SyncFile[];
  conflicts?: string[];
  proposedFiles?: SyncFile[];
};
export function HarnessCollaborationPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const selectedProposal = params.get('proposal');
  const user = useAppSelector((s) => s.auth.user);
  const [h, setH] = useState<Harness | null>(null),
    [items, setItems] = useState<Proposal[]>([]),
    [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null),
    [detail, setDetail] = useState<Details | null>(null),
    [path, setPath] = useState(''),
    [preview, setPreview] = useState(false);
  const [email, setEmail] = useState(''),
    [role, setRole] = useState('viewer'),
    [comment, setComment] = useState('');
  const key = 'skillshare-proposal:' + id + ':' + user?.id;
  async function load() {
    const [harness, list] = await Promise.all([
      api.get<Harness>('/harnesses/' + id),
      api.get<{ items: Proposal[] }>('/harnesses/' + id + '/proposals'),
    ]);
    setH(harness.data);
    setItems(list.data.items);
    if (harness.data.capabilities.canManage)
      setMembers((await api.get('/harnesses/' + id + '/members')).data.items);
  }
  useEffect(() => {
    void load().catch((e) => setError(errorMessage(e)));
  }, [id]);
  useEffect(() => {
    if (!selectedProposal || draft || detail?.id === selectedProposal) return;
    let live = true;
    void api
      .get<Details>('/harnesses/' + id + '/proposals/' + encodeURIComponent(selectedProposal))
      .then((r) => {
        if (live) {
          setDetail(r.data);
          setPreview(true);
          setPath('');
        }
      })
      .catch((e) => {
        if (live) setError(errorMessage(e));
      });
    return () => {
      live = false;
    };
  }, [id, selectedProposal, draft, detail?.id]);
  useEffect(() => {
    if (!draft) return;
    try {
      sessionStorage.setItem(key, JSON.stringify(draft));
    } catch {
      /* Keep in-memory edits when storage is unavailable. */
    }
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [draft, key]);
  async function act(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
      await load();
    } catch (e) {
      setError(errorMessage(e));
      try {
        await load();
      } catch {
        /* Preserve edits and the original action error. */
      }
    } finally {
      setBusy(false);
    }
  }
  async function begin() {
    if (!h) return;
    setParams({});
    setDetail(null);
    setPreview(false);
    const saved = sessionStorage.getItem(key);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const valid = harnessProposalSchema.parse({
          title: parsed.title || 'Draft proposal',
          description: parsed.description,
          revision: parsed.revision,
          files: parsed.files,
        });
        const baseFiles = harnessFilesSchema.parse(parsed.baseFiles);
        const proposedFiles = parsed.proposedFiles
          ? harnessFilesSchema.parse(parsed.proposedFiles)
          : undefined;
        const conflicts = Array.isArray(parsed.conflicts)
          ? parsed.conflicts.filter((p: unknown) => typeof p === 'string')
          : [];
        setDraft({ ...valid, baseFiles, proposedFiles, conflicts });
        setPath(valid.files[0]?.path ?? '');
        setNotice('Restored your local proposal. The server will check its base when merging.');
        return;
      } catch {
        sessionStorage.removeItem(key);
      }
    }
    let revision = h.revision,
      files = h.files;
    if (!h.capabilities.canReadDraft) {
      const releases = (await api.get('/harnesses/' + id + '/releases')).data.items;
      if (!releases[0])
        throw new Error('A release is required before viewers can propose changes.');
      const release = (await api.get('/harnesses/' + id + '/releases/' + releases[0].id)).data;
      revision = release.revision;
      files = release.files;
    }
    setDraft({ title: '', description: '', revision, files, baseFiles: files });
    setPath(files[0]?.path ?? '');
  }
  async function open(proposal: Proposal) {
    if (draft)
      throw new Error(
        'Submit your local proposal or keep it for later before opening another change.',
      );
    const value = (await api.get<Details>('/harnesses/' + id + '/proposals/' + proposal.id)).data;
    setDetail(value);
    setParams({ proposal: proposal.id });
    setPath('');
    setPreview(true);
    setComment('');
  }
  async function updateBase() {
    if (!detail) return;
    const current = (await api.get<Harness>('/harnesses/' + id)).data;
    const comparison = compareSync(detail.baseFiles, detail.files, current.files, 'push');
    const next = new Map(current.files.map((f) => [f.path, f]));
    for (const change of comparison.changes) {
      if (change.after) next.set(change.path, change.after);
      else next.delete(change.path);
    }
    setDraft({
      title: detail.title,
      description: detail.description,
      revision: current.revision,
      files: [...next.values()],
      baseFiles: current.files,
      conflicts: comparison.conflicts,
      proposedFiles: detail.files,
    });
    setDetail(null);
    setPreview(true);
    setPath('');
    setNotice(
      'New local proposal prepared against the current draft. Resolve conflicts and review all differences before submitting. Previous approvals do not carry over.',
    );
  }
  function resolve(path: string, keep: 'proposal' | 'draft') {
    if (!draft) return;
    const files = draft.files.filter((f) => f.path !== path);
    const file = (keep === 'proposal' ? draft.proposedFiles : draft.baseFiles)?.find(
      (f) => f.path === path,
    );
    if (file) files.push(file);
    setDraft({ ...draft, files, conflicts: draft.conflicts?.filter((p) => p !== path) });
  }
  function newFile() {
    const name = window.prompt('Native file path', '.claude/skills/new-skill/SKILL.md');
    if (!name || !draft) return;
    try {
      const files = harnessProposalSchema.shape.files.parse([
        ...draft.files,
        { path: name, content: '' },
      ]);
      setDraft({ ...draft, files });
      setPath(name);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  if (!h && !error) return <Loading />;
  const caps = h?.capabilities;
  const before = draft?.baseFiles ?? detail?.baseFiles ?? [];
  const after = draft?.files ?? detail?.files ?? [];
  const paths = [...new Set([...before, ...after].map((f) => f.path))].sort();
  const changes = paths.filter((p) => {
    const a = before.find((f) => f.path === p),
      b = after.find((f) => f.path === p);
    return a?.content !== b?.content || !!a?.executable !== !!b?.executable;
  });
  const active = path || (preview ? changes[0] : after[0]?.path) || '';
  const endpoint = '/harnesses/' + id + '/proposals/' + detail?.id;
  return (
    <div className="grid gap-6">
      <Button asChild variant="ghost" size="sm" className="-mb-2 -ml-2 w-fit text-muted-foreground">
        <Link to={'/harnesses/' + id + '/edit'}>
          <ArrowLeft /> Native files
        </Link>
      </Button>
      <PageTitle
        eyebrow="COLLABORATION"
        title={h?.name ?? 'Changes & access'}
        description="Propose, review, and merge native files. Published releases stay unchanged."
      />
      {error && <ErrorBox message={error} />}
      {notice && (
        <p
          role="status"
          className="rounded-xl border border-brand-border bg-brand-surface px-4 py-3 text-sm"
        >
          {notice}
        </p>
      )}
      {caps && (
        <p className="text-sm text-muted-foreground">
          Your role: <strong className="text-foreground">{caps.role ?? 'public contributor'}</strong>{' '}
          · {caps.requireReview ? 'Approved proposals required' : 'Direct edits enabled'}
        </p>
      )}
      {caps?.canManage && (
        <Collapsible className="rounded-xl border bg-card">
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-xl px-5 py-4 text-left font-semibold outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 [&[data-state=open]>svg]:rotate-180">
            Team access & draft protection
            <ChevronDown className="size-4 transition-transform" />
          </CollapsibleTrigger>
          <CollapsibleContent className="grid gap-4 border-t p-5">
            <p className="text-sm text-muted-foreground">
              Viewers use releases. Editors change drafts. Publishers review and publish. Only the
              owner manages access.
            </p>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={caps.requireReview}
                disabled={busy}
                onChange={(e) => {
                  const requireReview = e.currentTarget.checked;
                  if (h) setH({ ...h, capabilities: { ...h.capabilities, requireReview } });
                  void act(async () => {
                    try {
                      await api.put('/harnesses/' + id + '/policy', { requireReview });
                    } catch (error) {
                      setH(h);
                      throw error;
                    }
                  });
                }}
              />
              Require approved change proposals
            </label>
            <form
              className="flex flex-wrap items-end gap-x-4"
              onSubmit={(e) => {
                e.preventDefault();
                void act(async () => {
                  await api.post('/harnesses/' + id + '/members', { email, role });
                  setEmail('');
                  setNotice('Membership updated.');
                });
              }}
            >
              <div className="min-w-56 flex-1">
                <Field label="Member email">
                  <Input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
              </div>
              <div className="min-w-40">
                <Field label="Harness role">
                  <select
                    className={selectClass}
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    <option value="publisher">Publisher</option>
                  </select>
                </Field>
              </div>
              <Button className="mb-5" disabled={busy}>
                Add or update member
              </Button>
            </form>
            <ul className="divide-y">
              {members.map((member) => (
                <li
                  key={member.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                >
                  <span>
                    {member.name} · {member.email} · {member.role}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        await api.delete('/harnesses/' + id + '/members/' + member.id);
                        setNotice('Access removed.');
                      })
                    }
                  >
                    Remove access
                  </Button>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
      {!draft && caps?.canPropose && (
        <Button className="w-fit" disabled={busy} onClick={() => void act(begin)}>
          Propose changes
        </Button>
      )}
      {draft && (
        <section className="grid gap-4">
          <h2 className="text-xl font-semibold text-heading">
            New proposal · base revision {draft.revision}
          </h2>
          <p className="text-sm text-muted-foreground">
            Edits stay in this proposal. They do not change the Harness draft.
          </p>
          <div>
            <Field label="Change title">
              <Input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </Field>
            <Field label="Why this change is useful">
              <Textarea
                className="min-h-24"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </Field>
          </div>
          {!!draft.conflicts?.length && (
            <div className="grid gap-3 rounded-xl border border-warning/40 bg-warning-surface p-4">
              <h3 className="font-semibold">Resolve changed files</h3>
              {draft.conflicts.map((p) => (
                <div key={p} className="flex flex-wrap items-center gap-3">
                  <code className="font-mono text-xs">{p}</code>
                  <Button variant="outline" size="sm" onClick={() => resolve(p, 'proposal')}>
                    Keep proposed file
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => resolve(p, 'draft')}>
                    Keep current draft
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={newFile}>
              New file
            </Button>
            <Button
              variant="outline"
              disabled={!after.some((f) => f.path === active)}
              onClick={() => {
                setDraft({ ...draft, files: draft.files.filter((f) => f.path !== active) });
                setPath('');
              }}
            >
              Delete selected file
            </Button>
            <Button variant="outline" onClick={() => setPreview(!preview)}>
              {preview ? 'Edit files' : 'Review differences'}
            </Button>
            <Button
              disabled={busy || !changes.length || !!draft.conflicts?.length}
              onClick={() =>
                void act(async () => {
                  const input = harnessProposalSchema.parse({
                    title: draft.title,
                    description: draft.description,
                    revision: draft.revision,
                    files: draft.files,
                  });
                  const created = (await api.post('/harnesses/' + id + '/proposals', input)).data;
                  sessionStorage.removeItem(key);
                  setDraft(null);
                  setParams({ proposal: created.id });
                  setDetail((await api.get('/harnesses/' + id + '/proposals/' + created.id)).data);
                  setPreview(true);
                  setNotice('Proposal submitted for review.');
                })
              }
            >
              Submit proposal
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setDraft(null);
                setNotice(
                  'Your proposal is kept in this browser tab. Select Propose changes to resume.',
                );
              }}
            >
              Keep for later
            </Button>
          </div>
        </section>
      )}
      {detail && (
        <Card>
          <CardContent className="grid gap-3">
            <h2 className="text-xl font-semibold text-heading">
              {detail.title} · {detail.status}
            </h2>
            <p className="text-sm text-muted-foreground">
              {detail.authorName} · base revision {detail.baseRevision}
            </p>
            <p>{detail.description}</p>
            {detail.source && (
              <p className="text-sm">
                Git source commit: <code className="font-mono text-xs">{detail.source.commit}</code>{' '}
                (provided by contributor)
              </p>
            )}
            {detail.reviews.map((review, i) => (
              <p key={i} className="text-sm">
                {review.valid ? 'Approved by ' : 'Approval inactive: '}
                {review.reviewerName}
                {review.comment ? ': ' + review.comment : ''}
              </p>
            ))}
            {detail.status === 'open' && (
              <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
                {caps?.canReview && detail.authorId !== user?.id && (
                  <>
                    <div className="min-w-56 flex-1">
                      <Field label="Review comment">
                        <Input value={comment} onChange={(e) => setComment(e.target.value)} />
                      </Field>
                    </div>
                    <Button
                      className="mb-5"
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          await api.post(endpoint + '/approve', {
                            treeHash: detail.treeHash,
                            comment,
                          });
                          await open(detail);
                        })
                      }
                    >
                      Approve snapshot
                    </Button>
                  </>
                )}
                {caps?.canReview && (
                  <Button
                    className="mb-5"
                    disabled={
                      busy ||
                      !detail.reviews.some((r) => r.valid) ||
                      detail.baseRevision !== h?.revision
                    }
                    onClick={() =>
                      void act(async () => {
                        await api.post(endpoint + '/merge', {
                          treeHash: detail.treeHash,
                          revision: h!.revision,
                        });
                        await open(detail);
                        setNotice(
                          'Proposal merged into a new draft revision. Publish separately when ready.',
                        );
                      })
                    }
                  >
                    Merge proposal
                  </Button>
                )}
                {(caps?.canReview || detail.authorId === user?.id) && (
                  <Button
                    className="mb-5"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        await api.post(endpoint + '/close');
                        await open(detail);
                      })
                    }
                  >
                    Close proposal
                  </Button>
                )}
                {caps?.canReadDraft && detail.baseRevision !== h?.revision && (
                  <>
                    <p className="mb-5 text-sm text-muted-foreground">
                      The draft has changed. Review a new proposal against the current draft.
                    </p>
                    <Button
                      className="mb-5"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void act(updateBase)}
                    >
                      Update against current draft
                    </Button>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {(draft || detail) && (
        <section className="grid min-h-[600px] overflow-hidden rounded-xl border bg-card md:grid-cols-[260px_minmax(0,1fr)]">
          <nav
            aria-label="Proposal files"
            className="grid content-start gap-1 overflow-auto border-b bg-muted/40 p-3 md:border-r md:border-b-0"
          >
            <p className="mb-2 text-sm font-semibold">{preview ? 'Changed files' : 'Files'}</p>
            {(preview ? changes : paths).map((p) => (
              <Button
                type="button"
                key={p}
                variant={active === p ? 'secondary' : 'ghost'}
                aria-pressed={active === p}
                className={cn(
                  'h-auto justify-start px-2 py-1.5 text-left text-sm break-all whitespace-normal',
                  active === p && 'bg-brand-surface text-brand',
                )}
                onClick={() => setPath(p)}
              >
                {p}
                {!after.some((f) => f.path === p) ? ' (removed)' : ''}
              </Button>
            ))}
            {preview && !changes.length && (
              <p className="text-sm text-muted-foreground">No differences.</p>
            )}
          </nav>
          <div className="min-w-0">
            {active && (
              <p className="border-b p-3 text-sm break-all text-muted-foreground">
                {active} ·{' '}
                {before.some((f) => f.path === active)
                  ? after.some((f) => f.path === active)
                    ? 'Modified'
                    : 'Removed'
                  : 'Added'}
                {(before.find((f) => f.path === active)?.executable ||
                  after.find((f) => f.path === active)?.executable) && (
                  <span>
                    {' '}
                    · Executable: {before.find((f) => f.path === active)?.executable
                      ? 'yes'
                      : 'no'}{' '}
                    → {after.find((f) => f.path === active)?.executable ? 'yes' : 'no'}
                  </span>
                )}
              </p>
            )}
            <Suspense fallback={<Loading />}>
              {active &&
                (preview ? (
                  <Diff
                    filePath={active}
                    before={before.find((f) => f.path === active)?.content ?? ''}
                    after={after.find((f) => f.path === active)?.content ?? ''}
                  />
                ) : (
                  <Editor
                    modelPath={'proposal/' + id + '/' + active}
                    filePath={active}
                    issues={[]}
                    value={after.find((f) => f.path === active)?.content ?? ''}
                    readOnly={!draft || !after.some((f) => f.path === active)}
                    onChange={(value) => {
                      if (draft)
                        setDraft({
                          ...draft,
                          files: draft.files.map((f) =>
                            f.path === active ? { ...f, content: value } : f,
                          ),
                        });
                    }}
                  />
                ))}
            </Suspense>
          </div>
        </section>
      )}
      <section className="grid gap-3">
        <h2 className="text-xl font-semibold text-heading">Change proposals</h2>
        {!items.length && <p className="text-sm text-muted-foreground">No proposals yet.</p>}
        {items.map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={busy}
            className="grid w-full gap-1 rounded-xl border bg-card p-4 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
            onClick={() => void act(() => open(p))}
          >
            <strong className="text-heading">{p.title}</strong>
            <span className="block text-sm text-muted-foreground">
              {p.authorName} · {p.status} · base revision {p.baseRevision}
            </span>
          </button>
        ))}
        {items.length === 100 && (
          <p className="text-sm text-muted-foreground">Showing the 100 most recent proposals.</p>
        )}
      </section>
    </div>
  );
}
