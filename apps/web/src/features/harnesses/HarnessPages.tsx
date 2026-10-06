import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  FileCode2,
  FolderPlus,
  Maximize2,
  Minimize2,
  Rocket,
  Save,
  Upload,
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
import { Button, ErrorBox, Field, Loading, PageTitle } from '../../components/ui';
import { HarnessTemplatePanel } from './HarnessTemplatePanel';
import { HarnessExplorer, type HarnessFileAction, type HarnessPathTarget } from './HarnessExplorer';
import './harness-pages.css';

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
          <Link className="btn btn-primary" to="/harnesses/new">
            New Harness
          </Link>
        }
      />
      {error && <ErrorBox message={error} />}
      <div className="harness-grid">
        {items.map((h) => (
          <Link key={h.id} className="harness-card" to={'/harnesses/' + h.id + '/edit'}>
            <span className="harness-status">
              {h.visibility} · {h.files.length} files
            </span>
            <h2>{h.name}</h2>
            <p>{h.description}</p>
            <small>{h.slug}</small>
          </Link>
        ))}
        {!items.length && !error && (
          <div className="harness-empty">
            <h2>Start with the files you already use</h2>
            <p>Upload an agent file or a whole native configuration folder.</p>
            <Link className="btn btn-primary" to="/harnesses/new">
              Create a Harness
            </Link>
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
      <Link className="back-link" to="/harnesses">
        <ArrowLeft size={15} /> My Harnesses
      </Link>
      <PageTitle
        eyebrow="NATIVE FILE REPOSITORY"
        title="Create a Harness"
        description="Bring the files you already use. Keep their paths together in one editor and one release."
      />
      <form className="harness-create panel content-panel" onSubmit={submit}>
        {error && <ErrorBox message={error} />}
        <Field label="Harness name">
          <input
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
          <input
            required
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
          />
        </Field>
        <Field label="What does this repository help people do?">
          <textarea
            required
            minLength={10}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Agents and instructions for planning, implementing, and reviewing a feature."
          />
        </Field>
        <Field label="Release visibility">
          <select
            value={form.visibility}
            onChange={(e) => setForm({ ...form, visibility: e.target.value as Visibility })}
          >
            <option value="private">Private</option>
            <option value="team">Team</option>
            <option value="public">Public</option>
          </select>
        </Field>
        <section className="harness-import">
          <div>
            <h2>Start with native files</h2>
            <p>
              Import one file or a repository folder. Review preserved paths before your first
              release.
            </p>
          </div>
          <label className="btn btn-secondary">
            <Upload size={16} /> Add files
            <input hidden type="file" multiple onChange={(e) => void importFiles(e.target.files)} />
          </label>
          <label className="btn btn-secondary">
            <FolderPlus size={16} /> Add folder
            <input
              hidden
              type="file"
              multiple
              {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
              onChange={(e) => void importFiles(e.target.files)}
            />
          </label>
          {files.length > 0 && (
            <ul className="harness-import-list">
              {files.map((f) => (
                <li key={f.path}>
                  <FileCode2 size={15} />
                  {f.path}
                </li>
              ))}
            </ul>
          )}
        </section>
        <Button disabled={busy}>{busy ? 'Creating…' : 'Create Harness'}</Button>
      </form>
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
  const [pathRequest, setPathRequest] = useState<{
    action: 'new-file' | 'new-folder' | 'rename';
    target: HarnessPathTarget;
  } | null>(null);
  const [pathValue, setPathValue] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [remoteDraft, setRemoteDraft] = useState<Harness | null>(null);
  const [shareMessage, setShareMessage] = useState('');
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
    const media = window.matchMedia('(max-width: 720px)');
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
    void Promise.all([
      api.get<Harness>('/harnesses/' + id),
      api.get<{ items: { id: string; version: string }[] }>('/harnesses/' + id + '/releases'),
    ])
      .then(([a, b]) => {
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
      .catch((e) => setError(errorMessage(e)));
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
    setStatus('Saving…');
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
      className={
        'harness-editor ' +
        (collapsed ? 'tree-collapsed ' : '') +
        (expanded ? 'editor-expanded' : '')
      }
    >
      <header className="harness-editor-header">
        <div>
          <Link className="back-link" to="/harnesses">
            <ArrowLeft size={14} /> Harnesses
          </Link>
          <h1 title={harness.name}>{harness.name}</h1>
          <span>
            {harness.visibility} ·{' '}
            {releaseId ? 'Release' : canReadDraft ? 'Draft' : 'Latest release'} ·{' '}
            {!canEdit ? 'Read only' : status}
            {' · '}
            <Link
              to={'/users/' + harness.ownerId}
              title={'View ' + harness.ownerName + "'s profile"}
            >
              {harness.ownerName}
            </Link>
          </span>
        </div>
        <div className="harness-actions">
          <Link className="btn btn-secondary" to={'/harnesses/' + id + '/cli'}>
            Use with CLI
          </Link>
          {canReadDraft && (
            <Link className="btn btn-secondary" to={'/harnesses/' + id + '/history'}>
              History
            </Link>
          )}
          {user && (
            <Link className="btn btn-secondary" to={'/harnesses/' + id + '/changes'}>
              Changes & access
            </Link>
          )}
          <Button
            variant="secondary"
            aria-label={expanded ? 'Restore layout' : 'Expand editor'}
            title={expanded ? 'Restore layout' : 'Expand editor'}
            aria-pressed={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </Button>
          <Button
            className="harness-mobile-files"
            variant="secondary"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? 'Show files' : 'Hide files'}
          </Button>
          <select
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
            <Button variant="secondary" onClick={() => void downloadRelease()}>
              Download {selectedRelease ? 'v' + selectedRelease.version : 'latest release'}
            </Button>
          )}
          <Button
            variant="secondary"
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
            <Button variant="secondary" onClick={() => openTemplate('skill')}>
              New skill
            </Button>
          )}
          {canEdit && (
            <Button
              variant="secondary"
              onClick={() => fileAction('mcp', { path: selected, folder: false })}
            >
              MCP configuration
            </Button>
          )}
          {harness.capabilities.canEdit && !harness.capabilities.requireReview && releaseId && (
            <Button
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
            <Button variant="secondary" onClick={() => openTemplate('mcp')}>
              Add native files
            </Button>
          )}
          {harness.capabilities.canPublish && !releaseId && (
            <Button variant="secondary" onClick={() => setShowPublish(!showPublish)}>
              <Rocket size={16} /> Review & publish
            </Button>
          )}
        </div>
      </header>
      {harness.capabilities.requireReview && canReadDraft && (
        <p className="harness-release-notice">
          Changes require approval. Open Changes & access to edit a proposal without changing the
          draft.
        </p>
      )}
      {shareMessage && <p role="status">{shareMessage}</p>}
      {releaseId && (
        <p className="harness-release-notice">
          Published releases are read-only.
          {isOwner
            ? ' Use Edit draft to change skills or MCP configuration.'
            : ' Editing requires owner access.'}
        </p>
      )}
      {showPublish && (
        <form className="harness-publish" onSubmit={publish}>
          <Field label="Release version">
            <input required value={version} onChange={(e) => setVersion(e.target.value)} />
          </Field>
          <Field label="Release notes">
            <input
              required
              minLength={5}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <p>
            {files.length} files · {inspection.components.length} components ·{' '}
            {configurationErrors.length} errors
          </p>
          <details className="w-full">
            <summary>Review all {files.length} files in this release</summary>
            <ul>
              {files.map((file) => (
                <li key={file.path}>
                  <code>{file.path}</code>
                </li>
              ))}
            </ul>
            <p>
              MCP processes, hooks, and settings are included. Review their commands and permissions
              in the editor before publishing.
            </p>
          </details>
          <Button disabled={publishing || configurationErrors.length > 0}>
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
        <div className="harness-recovery">
          <p>Your edits are retained. Retry saving, or compare with the latest saved draft.</p>
          <Button variant="secondary" onClick={() => void save()}>
            Retry save
          </Button>
          <Button variant="secondary" onClick={() => void compareRemote()}>
            Compare latest
          </Button>
          <Button
            variant="secondary"
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
        <section className="harness-recovery">
          <h2>Compare saved draft (revision {remoteDraft.revision})</h2>
          <p>Local revision {revision}. Review differences before choosing how to recover.</p>
          <ul>
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
                  <details>
                    <summary>{path}</summary>
                    <div className="harness-conflict-content">
                      <div>
                        <strong>Latest saved</strong>
                        <pre>{remote?.content ?? '(missing)'}</pre>
                      </div>
                      <div>
                        <strong>My draft</strong>
                        <pre>{local?.content ?? '(missing)'}</pre>
                      </div>
                    </div>
                  </details>
                </li>
              ) : null;
            })}
          </ul>
          <Button variant="secondary" onClick={() => acceptRemote(true)}>
            Keep my draft for the next save
          </Button>
          <Button
            variant="secondary"
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
          <Button variant="secondary" onClick={() => setRemoteDraft(null)}>
            Cancel
          </Button>
        </section>
      )}
      {deleted && canEdit && (
        <div className="harness-undo" role="status">
          <span>
            Deleted {deleted.length} {deleted.length === 1 ? deleted[0]?.path : 'files'}
          </span>
          <button onClick={() => void undoDelete()}>Undo</button>
          <button aria-label="Dismiss undo" onClick={() => setDeleted(null)}>
            ×
          </button>
        </div>
      )}
      <div className="harness-workspace">
        <aside className="harness-tree">
          <HarnessExplorer
            files={viewFiles}
            selected={selected}
            onSelect={setSelected}
            canEdit={canEdit}
            onAction={fileAction}
          />
          {pathRequest && canEdit && (
            <form className="harness-path-form" onSubmit={createPath}>
              <Field
                label={
                  pathRequest.action === 'new-folder'
                    ? 'Folder path'
                    : pathRequest.action === 'rename'
                      ? 'New path'
                      : 'File path'
                }
              >
                <input
                  autoFocus
                  required
                  value={pathValue}
                  onChange={(event) => setPathValue(event.target.value)}
                  onFocus={(event) => event.target.select()}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setPathRequest(null);
                  }}
                />
              </Field>
              <Button>{pathRequest.action === 'rename' ? 'Rename' : 'Create'}</Button>
              <Button type="button" variant="secondary" onClick={() => setPathRequest(null)}>
                Cancel
              </Button>
            </form>
          )}
          {canEdit && (
            <div className="harness-import-toolbar">
              <label className="btn btn-secondary">
                Import files
                <input
                  hidden
                  type="file"
                  multiple
                  onChange={(event) => void addUpload(event.target.files)}
                />
              </label>
              <label className="btn btn-secondary">
                Import folder
                <input
                  hidden
                  type="file"
                  multiple
                  {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
                  onChange={(event) => void addUpload(event.target.files)}
                />
              </label>
            </div>
          )}
          <details className="harness-components">
            <summary>Components ({inspection.components.length})</summary>
            {inspection.components.map((component, index) => (
              <button
                key={component.path + ':' + index}
                onClick={() => setSelected(component.path)}
              >
                <span>
                  {component.kind.toUpperCase()} · {component.name}
                </span>
                <small>{component.runtime}</small>
                <small>{component.detail}</small>
              </button>
            ))}
            <p>Configuration preview. Connections and hook commands have not been executed.</p>
          </details>
          <button
            className="harness-tree-collapse"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand file tree' : 'Collapse file tree'}
          >
            {collapsed ? '›' : '‹'}
          </button>
        </aside>
        <main className="harness-editor-main">
          <div className="harness-file-tabs" role="tablist" aria-label="Open files">
            {openTabs
              .filter((path) => viewFiles.some((file) => file.path === path))
              .map((path) => (
                <div key={path} className={selected === path ? 'active' : ''}>
                  <button
                    role="tab"
                    aria-selected={selected === path}
                    title={path}
                    onClick={() => setSelected(path)}
                  >
                    {path.split('/').at(-1)}
                  </button>
                  <button
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
              <div className="harness-file-heading">
                <span title={active.path}>
                  <FileCode2 size={15} />
                  {active.path}
                </span>
                {canEdit && (
                  <button onClick={() => void save()}>
                    <Save size={15} /> Save now
                  </button>
                )}
              </div>
              <div className="harness-source-editor">
                <Suspense fallback={<Loading />}>
                  <SourceEditor
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
            </>
          ) : (
            <div className="harness-empty">
              <h2>Your files live here</h2>
              <p>Create a file or import a folder.</p>
            </div>
          )}
          {inspection.issues.length > 0 && (
            <details className="harness-diagnostics" open={configurationErrors.length > 0}>
              <summary>
                {configurationErrors.length} errors ·{' '}
                {inspection.issues.length - configurationErrors.length} notices
              </summary>
              {inspection.issues.map((issue, index) => (
                <button key={index} onClick={() => setSelected(issue.path)}>
                  {issue.severity.toUpperCase()}: {issue.path} — {issue.message}
                </button>
              ))}
            </details>
          )}
        </main>
      </div>
    </div>
  );
}
