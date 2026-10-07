import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronDown,
  FileCode2,
  FolderPlus,
  Maximize2,
  Minimize2,
  Rocket,
  Save,
  Upload,
  X,
} from 'lucide-react';
import {
  createHarnessSchema,
  harnessFilesSchema,
  inspectHarnessTree,
  assertShareable,
  canonicalTree,
  harnessReleaseSchema,
  nextStablePatch,
  type HarnessId,
  type HarnessTemplateKind,
  type Visibility,
  type HarnessCapabilities,
} from '@skillshare/contracts';
import { api, errorMessage } from '../../lib/http';
import { useAppSelector } from '../../app/hooks';
import { ErrorBox, Field, Loading, PageTitle } from '../../components/ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useLayoutMode } from '@/hooks/use-layout-mode';
import { cn } from '@/lib/utils';
import { HarnessTemplatePanel } from './HarnessTemplatePanel';
import { HarnessExplorer, type HarnessFileAction, type HarnessPathTarget } from './HarnessExplorer';
import { selectClass } from './harness-ui';
import { RatingSummaryInline } from '../../components/StarRating';

type FileEntry = { path: string; content: string };
type Harness = {
  id: string;
  name: string;
  slug: string;
  description: string;
  visibility: Visibility;
  revision: number;
  files: FileEntry[];
  ownerId: string;
  ownerName: string;
  capabilities: HarnessCapabilities;
  rating?: { average: number | null; count: number };
};
const SourceEditor = lazy(() => import('../editor/SourceEditor'));
const readFiles = async (list: FileList): Promise<FileEntry[]> =>
  Promise.all(
    Array.from(list).map(async (file) => {
      const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
      const suggested =
        relative ||
        (/\.jsonc?$/.test(file.name) || /^(CLAUDE|GEMINI)\.md$/.test(file.name)
          ? file.name
          : '.claude/agents/' + file.name);
      const path =
        !relative && list.length === 1
          ? window.prompt('Choose where this file belongs in the Harness', suggested)
          : suggested;
      if (!path) throw new Error('Import cancelled; no files were added.');
      const bytes = await file.arrayBuffer();
      const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
      if (content.includes('\0'))
        throw new Error(file.name + ' appears to be binary. Import text configuration files only.');
      return { path: path.trim().replace(/^\/+/, ''), content };
    }),
  );

const notice =
  'shrink-0 rounded-xl border border-brand-border bg-brand-surface px-3.5 py-2 text-sm text-foreground';
const disclosure =
  'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 [&[data-state=open]>svg:last-child]:rotate-180';

export function HarnessWorkspacePage() {
  const [items, setItems] = useState<Harness[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    void api
      .get<{ items: Harness[] }>('/harnesses?scope=workspace')
      .then((r) => setItems(r.data.items))
      .catch((e) => setError(errorMessage(e)));
  }, []);
  return (
    <>
      <PageTitle
        eyebrow="YOUR WORKSPACE"
        title="My Harnesses"
        description="Native agent configuration repositories, edited and released as complete file trees."
        action={
          <Button asChild size="lg" className="h-10 px-4 font-semibold">
            <Link to="/harnesses/new">New Harness</Link>
          </Button>
        }
      />
      {error && <ErrorBox message={error} />}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((h) => (
          <Link
            key={h.id}
            className="group grid content-start gap-2 rounded-xl border bg-card p-5 text-card-foreground outline-none transition-shadow hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50"
            to={'/harnesses/' + h.id + '/edit'}
          >
            <Badge variant="secondary" className="w-fit">
              {h.visibility} · {h.files.length} files
            </Badge>
            <h2 className="text-lg font-semibold text-heading group-hover:text-brand">{h.name}</h2>
            <p className="line-clamp-3 text-sm text-muted-foreground">{h.description}</p>
            <small className="font-mono text-xs text-text-faint">{h.slug}</small>
          </Link>
        ))}
        {!items.length && !error && (
          <div className="col-span-full grid justify-items-start gap-3 rounded-xl border border-dashed bg-card p-8">
            <h2 className="text-lg font-semibold text-heading">Start with the files you already use</h2>
            <p className="text-sm text-muted-foreground">
              Upload an agent file or a whole native configuration folder.
            </p>
            <Button asChild size="lg" className="h-10 px-4 font-semibold">
              <Link to="/harnesses/new">Create a Harness</Link>
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

export function NewHarnessPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    slug: '',
    description: '',
    visibility: 'private' as Visibility,
  });
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function importFiles(list: FileList | null) {
    if (!list) return;
    try {
      const combined = [...files, ...(await readFiles(list))];
      const parsed = harnessFilesSchema.safeParse(combined);
      if (!parsed.success)
        throw new Error(parsed.error.issues[0]?.message || 'Check imported paths and file sizes.');
      setFiles(combined);
      setError('');
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const parsed = createHarnessSchema.safeParse({ ...form, files });
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(' · '));
      return;
    }
    setBusy(true);
    try {
      const r = await api.post<Harness>('/harnesses', parsed.data);
      navigate('/harnesses/' + r.data.id + '/edit');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2 text-muted-foreground">
        <Link to="/harnesses">
          <ArrowLeft /> My Harnesses
        </Link>
      </Button>
      <PageTitle
        eyebrow="NATIVE FILE REPOSITORY"
        title="Create a Harness"
        description="Bring the files you already use. Keep their paths together in one editor and one release."
      />
      <Card className="max-w-3xl">
        <CardContent>
          <form className="grid" onSubmit={submit}>
            {error && <ErrorBox message={error} />}
            <Field label="Harness name">
              <Input
                required
                minLength={2}
                value={form.name}
                onChange={(e) =>
                  setForm({
                    ...form,
                    name: e.target.value,
                    slug: e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, '-')
                      .replace(/^-|-$/g, ''),
                  })
                }
                placeholder="AI Delivery Toolkit"
              />
            </Field>
            <Field label="URL slug">
              <Input
                required
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
              />
            </Field>
            <Field label="What does this repository help people do?">
              <Textarea
                required
                minLength={10}
                className="min-h-24"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Agents and instructions for planning, implementing, and reviewing a feature."
              />
            </Field>
            <Field label="Release visibility">
              <select
                className={selectClass}
                value={form.visibility}
                onChange={(e) => setForm({ ...form, visibility: e.target.value as Visibility })}
              >
                <option value="private">Private</option>
                <option value="team">Team</option>
                <option value="public">Public</option>
              </select>
            </Field>
            <section className="mb-6 grid gap-4 rounded-xl border border-dashed bg-muted/40 p-5">
              <div className="grid gap-1">
                <h2 className="text-base font-semibold text-heading">Start with native files</h2>
                <p className="text-sm text-muted-foreground">
                  Import one file or a repository folder. Review preserved paths before your first
                  release.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" className="cursor-pointer">
                  <label>
                    <Upload /> Add files
                    <input
                      hidden
                      type="file"
                      multiple
                      onChange={(e) => void importFiles(e.target.files)}
                    />
                  </label>
                </Button>
                <Button asChild variant="outline" className="cursor-pointer">
                  <label>
                    <FolderPlus /> Add folder
                    <input
                      hidden
                      type="file"
                      multiple
                      {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
                      onChange={(e) => void importFiles(e.target.files)}
                    />
                  </label>
                </Button>
              </div>
              {files.length > 0 && (
                <ul className="grid gap-1.5">
                  {files.map((f) => (
                    <li
                      key={f.path}
                      className="flex min-w-0 items-center gap-2 font-mono text-xs text-foreground"
                    >
                      <FileCode2 size={15} className="shrink-0 text-muted-foreground" />
                      <span className="truncate">{f.path}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <Button size="lg" className="h-10 justify-self-start px-4" disabled={busy}>
              {busy ? 'Creating…' : 'Create Harness'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}


export function HarnessEditorPage() {
  const { id } = useParams();
  return <HarnessEditor key={id} id={id!} />;
}
function HarnessEditor({ id }: { id: string }) {
  const user = useAppSelector((s) => s.auth.user);
  const [params, setParams] = useSearchParams();
  const releaseId = params.get('release') ?? '';
  const requestedFile = params.get('file') ?? '';
  const [releaseFiles, setReleaseFiles] = useState<FileEntry[] | null>(null);
  const [releaseLoading, setReleaseLoading] = useState(false);
  const baseline = useRef('[]');
  const filesRef = useRef<FileEntry[]>([]);
  const revisionRef = useRef(1);
  const saving = useRef<Promise<number | null> | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateKind, setTemplateKind] = useState<HarnessTemplateKind>('mcp');
  const [templateRuntime, setTemplateRuntime] = useState<HarnessId>('claude-code');
  const [templateSession, setTemplateSession] = useState(0);
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);
  useLayoutMode(expanded ? 'editor-expanded' : 'editor');
  const [pathRequest, setPathRequest] = useState<{
    action: 'new-file' | 'new-folder' | 'rename';
    target: HarnessPathTarget;
  } | null>(null);
  const [pathValue, setPathValue] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [remoteDraft, setRemoteDraft] = useState<Harness | null>(null);
  const [shareMessage, setShareMessage] = useState('');
  const [dismissedReleaseNotice, setDismissedReleaseNotice] = useState('');
  const [harness, setHarness] = useState<Harness | null>(null),
    [files, setFiles] = useState<FileEntry[]>([]),
    [selected, setSelected] = useState(''),
    [revision, setRevision] = useState(1),
    [status, setStatus] = useState('Loading…'),
    [error, setError] = useState(''),
    [releases, setReleases] = useState<{ id: string; version: string }[]>([]),
    [showPublish, setShowPublish] = useState(false),
    [version, setVersion] = useState('1.0.0'),
    [notes, setNotes] = useState('Initial Harness release'),
    [collapsed, setCollapsed] = useState(false);
  const [deleted, setDeleted] = useState<FileEntry[] | null>(null);
  useEffect(() => {
    if (selected)
      setOpenTabs((previous) => (previous.includes(selected) ? previous : [...previous, selected]));
  }, [selected]);
  useEffect(() => {
    setOpenTabs(selected ? [selected] : []);
  }, [releaseId]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 768px)');
    setCollapsed(media.matches);
    const change = () => setCollapsed(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  function changeFiles(next: FileEntry[] | ((previous: FileEntry[]) => FileEntry[])) {
    const value = typeof next === 'function' ? next(filesRef.current) : next;
    filesRef.current = value;
    setFiles(value);
  }
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      api.get<Harness>('/harnesses/' + id),
      api.get<{ items: { id: string; version: string }[] }>('/harnesses/' + id + '/releases'),
    ])
      .then(([a, b]) => {
        if (cancelled) return;
        setHarness(a.data);
        changeFiles(a.data.files || []);
        baseline.current = JSON.stringify(a.data.files || []);
        setRevision(a.data.revision);
        revisionRef.current = a.data.revision;
        if (!releaseId)
          setSelected(
            a.data.files?.find((file) => file.path === requestedFile)?.path ??
              a.data.files?.[0]?.path ??
              '',
          );
        setReleases(b.data.items);
        setStatus('Saved');
        if (b.data.items[0]) {
          setVersion(nextStablePatch(b.data.items[0].version));
        }
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [id]);
  useEffect(() => {
    let cancelled = false;
    setReleaseFiles(null);
    setShowTemplates(false);
    setShowPublish(false);
    if (!releaseId) {
      if (requestedFile && filesRef.current.some((file) => file.path === requestedFile))
        setSelected(requestedFile);
      return;
    }
    setReleaseLoading(true);
    void api
      .get<{ files: FileEntry[] }>('/harnesses/' + id + '/releases/' + releaseId)
      .then(({ data }) => {
        if (!cancelled) {
          setReleaseFiles(data.files);
          setSelected(
            data.files.find((file) => file.path === requestedFile)?.path ??
              data.files[0]?.path ??
              '',
          );
        }
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setReleaseLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, releaseId, requestedFile]);
  const viewFiles = releaseId ? (releaseFiles ?? []) : files;
  const active = viewFiles.find((f) => f.path === selected);
  async function save(): Promise<number | null> {
    if (saving.current) {
      const previous = await saving.current;
      if (previous === null) return null;
      return JSON.stringify(filesRef.current) === baseline.current ? previous : save();
    }
    const snapshot = filesRef.current;
    const encoded = JSON.stringify(snapshot);
    if (encoded === baseline.current) return revisionRef.current;
    const checked = harnessFilesSchema.safeParse(snapshot);
    if (!checked.success) {
      setStatus('Save failed');
      setError(checked.error.issues[0]?.message || 'Invalid file tree.');
      return null;
    }
    flushSync(() => setStatus('Saving…'));
    setError('');
    const request = (async () => {
      try {
        const { data } = await api.put<Harness>('/harnesses/' + id + '/files', {
          revision: revisionRef.current,
          files: snapshot,
        });
        revisionRef.current = data.revision;
        setRevision(data.revision);
        baseline.current = encoded;
        setStatus(JSON.stringify(filesRef.current) === encoded ? 'Saved' : 'Unsaved changes');
        return data.revision;
      } catch (e) {
        setStatus('Save failed');
        setError(errorMessage(e));
        return null;
      } finally {
        saving.current = null;
      }
    })();
    saving.current = request;
    return request;
  }
  useEffect(() => {
    if (
      !harness ||
      !harness.capabilities.canEdit ||
      harness.capabilities.requireReview ||
      JSON.stringify(files) === baseline.current ||
      status === 'Saving…' ||
      status === 'Save failed' ||
      publishing
    )
      return;
    const timer = window.setTimeout(() => {
      void save();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [files, harness, status, publishing, user?.id]);
  const inspection = useMemo(() => inspectHarnessTree(viewFiles), [viewFiles]);
  const configurationErrors = inspection.issues.filter((issue) => issue.severity === 'error');
  async function compareRemote() {
    try {
      const { data } = await api.get<Harness>('/harnesses/' + id);
      setRemoteDraft(data);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  function acceptRemote(keepLocal: boolean) {
    if (!remoteDraft) return;
    baseline.current = JSON.stringify(remoteDraft.files);
    revisionRef.current = remoteDraft.revision;
    setRevision(remoteDraft.revision);
    if (!keepLocal) changeFiles(remoteDraft.files);
    setRemoteDraft(null);
    setError('');
    setStatus(keepLocal ? 'Unsaved changes' : 'Saved');
  }
  async function addUpload(list: FileList | null) {
    if (!list) return;
    try {
      const imported = await readFiles(list);
      const next = [...files, ...imported];
      const checked = harnessFilesSchema.safeParse(next);
      if (!checked.success) throw new Error(checked.error.issues[0]?.message || 'Invalid import.');
      changeFiles(next);
      if (imported[0]) setSelected(imported[0].path);
      await save();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  function openTemplate(kind: HarnessTemplateKind, path = selected) {
    const runtime: HarnessId =
      path.includes('.gemini/') || path === '.gemini'
        ? 'gemini-cli'
        : path.includes('.github/') || path === '.github' || path.includes('.vscode/')
          ? 'copilot-vscode'
          : 'claude-code';
    setTemplateKind(kind);
    setTemplateRuntime(runtime);
    setTemplateSession((value) => value + 1);
    setShowTemplates(true);
  }
  function fileAction(action: HarnessFileAction, target: HarnessPathTarget) {
    if (action === 'mcp' || action === 'settings') {
      const runtimeRoot = target.path.match(/\.(claude|gemini|github|vscode)(?:\/|$)/)?.[1];
      const candidates = inspection.components.filter((component) => component.kind === action);
      const destinations =
        action === 'mcp'
          ? runtimeRoot === 'gemini'
            ? ['.gemini/settings.json']
            : runtimeRoot === 'github' || runtimeRoot === 'vscode'
              ? ['.vscode/mcp.json', '.mcp.json']
              : ['.mcp.json', '.vscode/mcp.json', '.gemini/settings.json']
          : runtimeRoot === 'gemini'
            ? ['.gemini/settings.json']
            : runtimeRoot === 'github' || runtimeRoot === 'vscode'
              ? ['.vscode/settings.json']
              : ['.claude/settings.json'];
      // Raw files must remain accessible even when their configuration cannot be parsed.
      const raw = destinations.flatMap((destination) =>
        viewFiles.filter(
          (file) => file.path === destination || file.path.endsWith('/' + destination),
        ),
      )[0];
      if (raw) {
        setSelected(raw.path);
        setShowTemplates(false);
        return;
      }
      const match =
        candidates.find((component) => component.path === target.path) ??
        candidates.find(
          (component) => runtimeRoot && component.path.includes('.' + runtimeRoot + '/'),
        ) ??
        (!runtimeRoot ? candidates[0] : undefined);
      if (match) {
        setSelected(match.path);
        setShowTemplates(false);
        return;
      }
    }
    if (
      action === 'skill' ||
      action === 'agent' ||
      action === 'mcp' ||
      action === 'hook' ||
      action === 'settings'
    ) {
      openTemplate(action, target.path);
      return;
    }
    if (action === 'delete') {
      void removePath(target);
      return;
    }
    const parent = target.folder
      ? target.path
      : target.path.includes('/')
        ? target.path.slice(0, target.path.lastIndexOf('/'))
        : '';
    setPathRequest({ action, target });
    setPathValue(
      action === 'rename'
        ? target.path
        : (parent ? parent + '/' : '') + (action === 'new-folder' ? 'new-folder' : 'new-file.md'),
    );
  }
  async function createPath(event: React.FormEvent) {
    event.preventDefault();
    if (!pathRequest) return;
    if (pathRequest.action === 'rename') {
      await renamePath(pathRequest.target.path, pathRequest.target.folder, pathValue);
      setPathRequest(null);
      return;
    }
    const path =
      pathValue.trim().replace(/\/$/, '') +
      (pathRequest.action === 'new-folder' ? '/.gitkeep' : '');
    const next = [...filesRef.current, { path, content: '' }];
    const check = harnessFilesSchema.safeParse(next);
    if (!check.success) {
      setError(check.error.issues[0]?.message ?? 'Invalid path.');
      return;
    }
    changeFiles(next);
    setSelected(path);
    setPathRequest(null);
    setError('');
    await save();
  }
  async function removePath(target: HarnessPathTarget) {
    const matches = (file: FileEntry) =>
      file.path === target.path || (target.folder && file.path.startsWith(target.path + '/'));
    const removed = filesRef.current.filter(matches);
    if (!removed.length) return;
    const next = filesRef.current.filter((file) => !matches(file));
    setDeleted(removed);
    changeFiles(next);
    setOpenTabs((previous) =>
      previous.filter((path) => !removed.some((file) => file.path === path)),
    );
    if (removed.some((file) => file.path === selected)) setSelected(next[0]?.path ?? '');
    await save();
  }
  async function undoDelete() {
    if (!deleted) return;
    const next = [...files, ...deleted].sort((a, b) => a.path.localeCompare(b.path));
    changeFiles(next);
    setSelected(deleted[0]?.path ?? '');
    setDeleted(null);
    await save();
  }
  async function renamePath(path: string, isFolder = false, nextPath?: string) {
    if (!nextPath) return;
    const source = path.replace(/\/$/, '');
    const target = nextPath.trim().replace(/\/$/, '');
    if (!target || target === source) return;
    const mentions = files
      .filter((file) => file.path !== source && file.content.includes(source))
      .map((file) => file.path);
    if (
      mentions.length &&
      !window.confirm(
        'These files mention the old path and may need edits: ' +
          mentions.join(', ') +
          '. Rename the path and review those references?',
      )
    )
      return;
    const next = files.map((file) => {
      const matches = isFolder
        ? file.path === source || file.path.startsWith(source + '/')
        : file.path === source;
      return matches ? { ...file, path: target + file.path.slice(source.length) } : file;
    });
    const checked = harnessFilesSchema.safeParse(next);
    if (!checked.success) {
      setError(checked.error.issues[0]?.message || 'That path is not valid.');
      return;
    }
    changeFiles(next);
    setOpenTabs((previous) =>
      previous.map((path) =>
        path === source || (isFolder && path.startsWith(source + '/'))
          ? target + path.slice(source.length)
          : path,
      ),
    );
    if (selected === source || selected.startsWith(source + '/'))
      setSelected(target + selected.slice(source.length));
    await save();
  }
  async function publish(e: React.FormEvent) {
    e.preventDefault();
    if (!files.length) {
      setError('Add at least one native file before publishing.');
      return;
    }
    if (configurationErrors.length) {
      setError('Fix native configuration errors before publishing.');
      return;
    }
    setPublishing(true);
    try {
      assertShareable(files);
      harnessReleaseSchema.parse({ revision, version, notes });
      const reviewedTree = canonicalTree(files);
      const checksum = Array.from(
        new Uint8Array(
          await crypto.subtle.digest('SHA-256', new TextEncoder().encode(reviewedTree)),
        ),
        (byte) => byte.toString(16).padStart(2, '0'),
      ).join('');
      const savedRevision = await save();
      if (!savedRevision) return;
      await api.post('/harnesses/' + id + '/releases', {
        revision: savedRevision,
        version,
        notes,
        treeHash: checksum,
      });
      const r = await api.get<{ items: { id: string; version: string }[] }>(
        '/harnesses/' + id + '/releases',
      );
      setReleases(r.data.items);
      setShowPublish(false);
      setError('');
      setVersion(nextStablePatch(version));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPublishing(false);
    }
  }
  if (error && !harness) return <ErrorBox message={error} />;
  if (!harness) return <Loading />;
  const isOwner = harness.ownerId === user?.id;
  const canReadDraft = harness.capabilities.canReadDraft;
  const canEdit = harness.capabilities.canEdit && !harness.capabilities.requireReview && !releaseId;
  const selectedRelease =
    releases.find((release) => release.id === releaseId) ??
    (!canReadDraft ? releases[0] : undefined);
  async function downloadRelease() {
    const selectedId = selectedRelease?.id ?? releases[0]?.id;
    if (!selectedId) return;
    try {
      const { data } = await api.get<Blob>(
        '/harnesses/' + id + '/releases/' + selectedId + '/export',
        { responseType: 'blob' },
      );
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download =
        harness!.slug + '-' + (selectedRelease?.version ?? releases[0]?.version) + '.zip';
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <div
      data-testid="harness-editor"
      data-tree-collapsed={collapsed ? 'true' : 'false'}
      data-editor-expanded={expanded ? 'true' : 'false'}
      className="flex h-full min-h-0 flex-col gap-2 overflow-auto"
    >
      <header
        className="grid shrink-0 gap-2 rounded-xl border bg-card px-3 py-2"
        data-testid="harness-editor-header"
      >
        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 md:grid-cols-[auto_minmax(0,1fr)_auto]">
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
            <Link to="/harnesses">
              <ArrowLeft /> Harnesses
            </Link>
          </Button>
          <h1 title={harness.name} className="truncate text-lg font-semibold text-heading">
            {harness.name}
          </h1>
          <span className="col-span-full text-xs text-muted-foreground md:col-span-1 md:whitespace-nowrap">
            {harness.visibility} · {releaseId ? 'Release' : canReadDraft ? 'Draft' : 'Latest release'}{' '}
            · {!canEdit ? 'Read only' : status}
            {' · '}
            <Link
              className="font-medium text-brand hover:underline"
              to={'/users/' + harness.ownerId}
              title={'View ' + harness.ownerName + "'s profile"}
            >
              {harness.ownerName}
            </Link>
            {harness.rating && (
              <>
                {' · '}
                <Link
                  className="rounded hover:text-primary"
                  to={'/harnesses/' + harness.id + '/reviews'}
                  title="Ratings and reviews"
                >
                  <RatingSummaryInline
                    average={harness.rating.average}
                    count={harness.rating.count}
                  />
                </Link>
              </>
            )}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            aria-label={expanded ? 'Restore layout' : 'Expand editor'}
            title={expanded ? 'Restore layout' : 'Expand editor'}
            aria-pressed={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <Minimize2 /> : <Maximize2 />}
          </Button>
          <Button
            className="md:hidden"
            variant="outline"
            size="sm"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? 'Show files' : 'Hide files'}
          </Button>
          <select
            className={cn(selectClass, 'h-7 w-auto min-w-36 text-xs max-md:flex-1')}
            aria-label="Repository version"
            value={releaseId}
            onChange={(event) => {
              const next = new URLSearchParams(params);
              if (event.target.value) next.set('release', event.target.value);
              else next.delete('release');
              setParams(next);
            }}
          >
            <option value="">{canReadDraft ? 'Draft' : 'Latest release'}</option>
            {releases.map((release) => (
              <option key={release.id} value={release.id}>
                v{release.version}
              </option>
            ))}
          </select>
          {releases.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => void downloadRelease()}>
              Download {selectedRelease ? 'v' + selectedRelease.version : 'latest release'}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void navigator.clipboard
                .writeText(window.location.href)
                .then(() => setShareMessage('Link copied. Access permissions are unchanged.'))
                .catch(() =>
                  setShareMessage('Copy the address from your browser to share this Harness.'),
                );
            }}
          >
            Copy link
          </Button>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => openTemplate('skill')}>
              New skill
            </Button>
          )}
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileAction('mcp', { path: selected, folder: false })}
            >
              MCP configuration
            </Button>
          )}
          {harness.capabilities.canEdit && !harness.capabilities.requireReview && releaseId && (
            <Button
              size="sm"
              onClick={() => {
                const next = new URLSearchParams(params);
                next.delete('release');
                setParams(next);
                setSelected(
                  files.find((file) => file.path === selected)?.path ?? files[0]?.path ?? '',
                );
              }}
            >
              Edit draft
            </Button>
          )}
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => openTemplate('mcp')}>
              Add native files
            </Button>
          )}
          {harness.capabilities.canPublish && !releaseId && (
            <Button variant="outline" size="sm" onClick={() => setShowPublish(!showPublish)}>
              <Rocket /> Review & publish
            </Button>
          )}
        </div>
      </header>
      {harness.capabilities.requireReview && canReadDraft && (
        <p className={notice}>
          Changes require approval. Open Changes & access to edit a proposal without changing the
          draft.
        </p>
      )}
      {shareMessage && (
        <p role="status" className="shrink-0 text-xs text-muted-foreground">
          {shareMessage}
        </p>
      )}
      {releaseId && dismissedReleaseNotice !== releaseId && (
        <div className={cn(notice, 'flex items-start justify-between gap-3')}>
          <p>
            Published releases are read-only.
            {isOwner
              ? ' Use Edit draft to change skills or MCP configuration.'
              : ' Editing requires owner access.'}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="-my-1 -mr-1.5 shrink-0"
            aria-label="Dismiss message"
            onClick={() => setDismissedReleaseNotice(releaseId)}
          >
            <X />
          </Button>
        </div>
      )}
      {showPublish && (
        <form className="grid shrink-0 gap-3 rounded-xl border bg-card p-4" onSubmit={publish}>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Field label="Release version">
              <Input required value={version} onChange={(e) => setVersion(e.target.value)} />
            </Field>
            <Field label="Release notes">
              <Input
                required
                minLength={5}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
          </div>
          <p className="text-sm text-muted-foreground">
            {files.length} files · {inspection.components.length} components ·{' '}
            {configurationErrors.length} errors
          </p>
          <Collapsible className="rounded-lg border">
            <CollapsibleTrigger className={disclosure}>
              Review all {files.length} files in this release
              <ChevronDown className="size-4 transition-transform" />
            </CollapsibleTrigger>
            <CollapsibleContent className="grid max-h-60 gap-2 overflow-auto border-t px-3 py-3 text-sm">
              <ul className="grid gap-1">
                {files.map((file) => (
                  <li key={file.path}>
                    <code className="font-mono text-xs">{file.path}</code>
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground">
                MCP processes, hooks, and settings are included. Review their commands and
                permissions in the editor before publishing.
              </p>
            </CollapsibleContent>
          </Collapsible>
          <Button className="justify-self-start" disabled={publishing || configurationErrors.length > 0}>
            {publishing ? 'Publishing…' : 'Publish Harness release'}
          </Button>
        </form>
      )}
      {showTemplates && canEdit && (
        <HarnessTemplatePanel
          key={templateSession}
          initialKind={templateKind}
          initialRuntime={templateRuntime}
          onOpenExisting={(path) => {
            setSelected(path);
            setShowTemplates(false);
          }}
          files={files}
          onClose={() => setShowTemplates(false)}
          onApply={(next, path) => {
            changeFiles(next);
            setSelected(path);
            setShowTemplates(false);
            void save();
          }}
        />
      )}
      {error && <ErrorBox message={error} />}
      {status === 'Save failed' && canEdit && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-warning/40 bg-warning-surface p-3">
          <p className="mr-auto text-sm">
            Your edits are retained. Retry saving, or compare with the latest saved draft.
          </p>
          <Button variant="outline" size="sm" onClick={() => void save()}>
            Retry save
          </Button>
          <Button variant="outline" size="sm" onClick={() => void compareRemote()}>
            Compare latest
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(files, null, 2)], { type: 'application/json' }),
              );
              const link = document.createElement('a');
              link.href = url;
              link.download = harness.slug + '-draft.json';
              link.click();
              URL.revokeObjectURL(url);
            }}
          >
            Download my draft
          </Button>
        </div>
      )}
      {remoteDraft && (
        <section className="grid shrink-0 gap-3 rounded-xl border border-warning/40 bg-warning-surface p-4">
          <h2 className="text-base font-semibold text-heading">
            Compare saved draft (revision {remoteDraft.revision})
          </h2>
          <p className="text-sm text-muted-foreground">
            Local revision {revision}. Review differences before choosing how to recover.
          </p>
          <ul className="grid gap-2">
            {Array.from(
              new Set([
                ...files.map((file) => file.path),
                ...remoteDraft.files.map((file) => file.path),
              ]),
            ).map((path) => {
              const local = files.find((file) => file.path === path),
                remote = remoteDraft.files.find((file) => file.path === path);
              return local?.content !== remote?.content ? (
                <li key={path}>
                  <Collapsible className="rounded-lg border bg-card">
                    <CollapsibleTrigger className={disclosure}>
                      <span className="truncate font-mono text-xs">{path}</span>
                      <ChevronDown className="size-4 shrink-0 transition-transform" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="grid gap-3 border-t p-3 md:grid-cols-2">
                      <div className="grid min-w-0 gap-1">
                        <strong className="text-sm">Latest saved</strong>
                        <pre className="max-h-60 overflow-auto rounded-md bg-muted p-2 font-mono text-xs">
                          {remote?.content ?? '(missing)'}
                        </pre>
                      </div>
                      <div className="grid min-w-0 gap-1">
                        <strong className="text-sm">My draft</strong>
                        <pre className="max-h-60 overflow-auto rounded-md bg-muted p-2 font-mono text-xs">
                          {local?.content ?? '(missing)'}
                        </pre>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </li>
              ) : null;
            })}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => acceptRemote(true)}>
              Keep my draft for the next save
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (
                  window.confirm(
                    'Replace local edits with the latest saved draft? Download your draft first if you need a copy.',
                  )
                )
                  acceptRemote(false);
              }}
            >
              Reload latest
            </Button>
            <Button variant="outline" size="sm" onClick={() => setRemoteDraft(null)}>
              Cancel
            </Button>
          </div>
        </section>
      )}
      {deleted && canEdit && (
        <div
          className="flex shrink-0 items-center gap-3 rounded-xl border border-brand-border bg-brand-surface px-3.5 py-2 text-sm"
          role="status"
        >
          <span className="mr-auto">
            Deleted {deleted.length} {deleted.length === 1 ? deleted[0]?.path : 'files'}
          </span>
          <Button variant="outline" size="sm" onClick={() => void undoDelete()}>
            Undo
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Dismiss undo"
            onClick={() => setDeleted(null)}
          >
            <X />
          </Button>
        </div>
      )}
      <div
        className={cn(
          'grid min-h-[200px] flex-[1_0_200px] overflow-hidden rounded-xl border bg-card',
          collapsed
            ? 'grid-cols-[0_minmax(0,1fr)]'
            : 'grid-cols-[160px_minmax(0,1fr)] md:grid-cols-[260px_minmax(0,1fr)]',
        )}
      >
        <aside
          className={cn(
            'relative flex min-h-0 min-w-0 flex-col border-r bg-muted/40',
            collapsed && 'w-0 border-0',
          )}
        >
          <div className={cn('flex min-h-0 flex-1 flex-col', collapsed && 'hidden')}>
            <HarnessExplorer
              files={viewFiles}
              selected={selected}
              onSelect={setSelected}
              canEdit={canEdit}
              onAction={fileAction}
            />
            <div className="flex max-h-[50%] shrink-0 flex-col overflow-auto border-t">
              {pathRequest && canEdit && (
                <form
                  className="grid gap-2 border-b p-3"
                  data-testid="harness-path-form"
                  onSubmit={createPath}
                >
                  <Field
                    label={
                      pathRequest.action === 'new-folder'
                        ? 'Folder path'
                        : pathRequest.action === 'rename'
                          ? 'New path'
                          : 'File path'
                    }
                  >
                    <Input
                      autoFocus
                      required
                      className="font-mono text-xs md:text-xs"
                      value={pathValue}
                      onChange={(event) => setPathValue(event.target.value)}
                      onFocus={(event) => event.target.select()}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') setPathRequest(null);
                      }}
                    />
                  </Field>
                  <div className="flex gap-2">
                    <Button size="sm">{pathRequest.action === 'rename' ? 'Rename' : 'Create'}</Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPathRequest(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
              {canEdit && (
                <div className="flex flex-wrap gap-2 border-b p-3">
                  <Button asChild variant="outline" size="sm" className="cursor-pointer">
                    <label>
                      Import files
                      <input
                        hidden
                        type="file"
                        multiple
                        onChange={(event) => void addUpload(event.target.files)}
                      />
                    </label>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="cursor-pointer">
                    <label>
                      Import folder
                      <input
                        hidden
                        type="file"
                        multiple
                        {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
                        onChange={(event) => void addUpload(event.target.files)}
                      />
                    </label>
                  </Button>
                </div>
              )}
              <Collapsible>
                <CollapsibleTrigger className={cn(disclosure, 'text-xs')}>
                  Components ({inspection.components.length})
                  <ChevronDown className="size-4 transition-transform" />
                </CollapsibleTrigger>
                <CollapsibleContent className="grid gap-1 px-2 pb-3">
                  {inspection.components.map((component, index) => (
                    <button
                      type="button"
                      key={component.path + ':' + index}
                      className="grid min-w-0 gap-0.5 rounded-md px-2 py-1.5 text-left text-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60"
                      onClick={() => setSelected(component.path)}
                    >
                      <span className="truncate font-medium text-foreground">
                        {component.kind.toUpperCase()} · {component.name}
                      </span>
                      <small className="truncate text-muted-foreground">{component.runtime}</small>
                      <small className="truncate text-muted-foreground">{component.detail}</small>
                    </button>
                  ))}
                  <p className="px-2 text-xs text-muted-foreground">
                    Configuration preview. Connections and hook commands have not been executed.
                  </p>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>
          <button
            type="button"
            className={cn(
              'absolute top-2 z-10 hidden h-8 w-5 items-center justify-center rounded-r-md border bg-card text-lg text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 md:flex',
              collapsed ? 'left-0' : 'right-0 translate-x-full',
            )}
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand file tree' : 'Collapse file tree'}
          >
            {collapsed ? '›' : '‹'}
          </button>
        </aside>
        <div
          className="flex min-h-0 min-w-0 flex-col overflow-hidden"
          data-testid="harness-editor-main"
        >
          <div
            className="flex shrink-0 overflow-x-auto border-b bg-muted/40"
            role="tablist"
            aria-label="Open files"
          >
            {openTabs
              .filter((path) => viewFiles.some((file) => file.path === path))
              .map((path) => (
                <div
                  key={path}
                  className={cn(
                    'flex shrink-0 items-center border-r border-b-2',
                    selected === path
                      ? 'border-b-brand bg-card text-foreground'
                      : 'border-b-transparent text-muted-foreground hover:bg-muted',
                  )}
                >
                  <button
                    type="button"
                    role="tab"
                    className="max-w-48 truncate py-1.5 pr-1 pl-3 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                    aria-selected={selected === path}
                    title={path}
                    onClick={() => setSelected(path)}
                  >
                    {path.split('/').at(-1)}
                  </button>
                  <button
                    type="button"
                    className="mr-1 rounded px-1.5 text-base leading-none text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
                    aria-label={'Close ' + path}
                    onClick={() => {
                      const next = openTabs.filter((item) => item !== path);
                      setOpenTabs(next);
                      if (selected === path) setSelected(next.at(-1) ?? '');
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
          </div>
          {releaseLoading ? (
            <Loading />
          ) : active ? (
            <>
              <div
                className="flex min-h-9 shrink-0 items-center justify-between gap-2 border-b px-3"
                data-testid="harness-file-heading"
              >
                <span
                  className="flex min-w-0 items-center gap-2 font-mono text-xs text-muted-foreground"
                  title={active.path}
                >
                  <FileCode2 size={15} className="shrink-0" />
                  <span className="truncate">{active.path}</span>
                </span>
                {canEdit && (
                  <Button variant="ghost" size="xs" onClick={() => void save()}>
                    <Save /> Save now
                  </Button>
                )}
              </div>
              <div
                className="relative min-h-0 flex-1 overflow-hidden"
                data-testid="harness-source-editor"
              >
                <div className="absolute inset-0">
                  <Suspense fallback={<Loading />}>
                    <SourceEditor
                      height="100%"
                      modelPath={'harness:' + id + ':' + (releaseId || 'draft') + ':' + active.path}
                      filePath={active.path}
                      value={active.content}
                      readOnly={!canEdit}
                      onChange={(value) =>
                        canEdit &&
                        changeFiles((previous) =>
                          previous.map((f) => (f.path === selected ? { ...f, content: value } : f)),
                        )
                      }
                      issues={inspection.issues.filter((issue) => issue.path === active.path)}
                      onSave={() => {
                        if (canEdit) void save();
                      }}
                    />
                  </Suspense>
                </div>
              </div>
            </>
          ) : (
            <div className="grid flex-1 place-content-center gap-1 p-8 text-center">
              <h2 className="text-base font-semibold text-heading">Your files live here</h2>
              <p className="text-sm text-muted-foreground">Create a file or import a folder.</p>
            </div>
          )}
          {inspection.issues.length > 0 && (
            <Collapsible
              className="shrink-0 border-t bg-muted/40"
              defaultOpen={configurationErrors.length > 0}
            >
              <CollapsibleTrigger className={cn(disclosure, 'text-xs')}>
                <span>
                  {configurationErrors.length} errors ·{' '}
                  {inspection.issues.length - configurationErrors.length} notices
                </span>
                <ChevronDown className="size-4 transition-transform" />
              </CollapsibleTrigger>
              <CollapsibleContent className="grid max-h-40 gap-1 overflow-auto px-2 pb-2">
                {inspection.issues.map((issue, index) => (
                  <button
                    type="button"
                    key={index}
                    className={cn(
                      'rounded-md px-2 py-1.5 text-left text-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60',
                      issue.severity === 'error' ? 'text-destructive' : 'text-foreground',
                    )}
                    onClick={() => setSelected(issue.path)}
                  >
                    {issue.severity.toUpperCase()}: {issue.path} — {issue.message}
                  </button>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </div>
    </div>
  );
}
