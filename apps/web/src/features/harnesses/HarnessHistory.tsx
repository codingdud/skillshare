import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, errorMessage } from '../../lib/http';
import { Button, ErrorBox, Loading, PageTitle } from '../../components/ui';
import type { SyncFile, HarnessCapabilities } from '@skillshare/contracts';
const Diff = lazy(() =>
  import('../editor/SourceEditor').then((module) => ({ default: module.SourceDiffEditor })),
);
type Revision = {
  id: string;
  revision: number;
  message: string;
  source: string;
  authorName: string | null;
  createdAt: string;
};
type Snapshot = { revision: number; files: SyncFile[] };
export function HarnessHistoryPage() {
  const { id } = useParams(),
    [items, setItems] = useState<Revision[]>([]),
    [error, setError] = useState('');
  const [base, setBase] = useState(''),
    [head, setHead] = useState(''),
    [snapshots, setSnapshots] = useState<[Snapshot, Snapshot] | null>(null),
    [path, setPath] = useState(''),
    [restoring, setRestoring] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null),
    [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false),
    [restorePreview, setRestorePreview] = useState<{
      revision: number;
      target: string;
      paths: string[];
    } | null>(null);
  const [canRestore, setCanRestore] = useState(false);
  useEffect(() => {
    void api
      .get<{ capabilities: HarnessCapabilities }>('/harnesses/' + id)
      .then((r) => setCanRestore(r.data.capabilities.canEdit && !r.data.capabilities.requireReview))
      .catch((e) => setError(errorMessage(e)));
  }, [id]);
  useEffect(() => {
    let live = true;
    setItems([]);
    setCursor(null);
    setSnapshots(null);
    setError('');
    void api
      .get('/harnesses/' + id + '/revisions')
      .then((r) => {
        if (!live) return;
        setCursor(r.data.nextCursor);
        setItems(r.data.items);
        setHead(r.data.items[0]?.id ?? '');
        setBase(r.data.items[1]?.id ?? r.data.items[0]?.id ?? '');
      })
      .catch((e) => {
        if (live) setError(errorMessage(e));
      });
    return () => {
      live = false;
    };
  }, [id]);
  useEffect(() => {
    let live = true;
    if (!base || !head) return;
    void Promise.all([
      api.get<Snapshot>('/harnesses/' + id + '/revisions/' + base),
      api.get<Snapshot>('/harnesses/' + id + '/revisions/' + head),
    ])
      .then(([a, b]) => {
        if (live) {
          setSnapshots([a.data, b.data]);
          setPath('');
        }
      })
      .catch((e) => {
        if (live) setError(errorMessage(e));
      });
    return () => {
      live = false;
    };
  }, [id, base, head]);
  const changes = snapshots
    ? [...new Set(snapshots.flatMap((s) => s.files.map((f) => f.path)))]
        .filter((path) => {
          const a = snapshots[0].files.find((f) => f.path === path),
            b = snapshots[1].files.find((f) => f.path === path);
          return a?.content !== b?.content || !!a?.executable !== !!b?.executable;
        })
        .sort()
    : [];
  const selected = path || changes[0] || '';
  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await api.get('/harnesses/' + id + '/revisions', { params: { before: cursor } });
      setItems((previous) => [
        ...previous,
        ...r.data.items.filter((item: Revision) => !previous.some((p) => p.id === item.id)),
      ]);
      setCursor(r.data.nextCursor);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  }
  async function reviewRestore() {
    setBusy(true);
    setError('');
    try {
      const [current, target] = await Promise.all([
        api.get<Snapshot>('/harnesses/' + id + '/manifest?ref=draft'),
        api.get<Snapshot>('/harnesses/' + id + '/revisions/' + head),
      ]);
      const paths = [...new Set([...current.data.files, ...target.data.files].map((f) => f.path))]
        .filter((path) => {
          const a = current.data.files.find((f) => f.path === path),
            b = target.data.files.find((f) => f.path === path);
          return a?.content !== b?.content || !!a?.executable !== !!b?.executable;
        })
        .sort();
      setRestorePreview({ revision: current.data.revision, target: head, paths });
      setRestoring(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function restore() {
    if (!restorePreview) return;
    setBusy(true);
    setError('');
    try {
      await api.post('/harnesses/' + id + '/restore', {
        revisionId: restorePreview.target,
        revision: restorePreview.revision,
      });
      window.location.assign('/harnesses/' + id + '/edit');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      setRestoring(false);
    }
  }
  return (
    <>
      <PageTitle
        title="Harness history"
        description="Immutable working revisions. Restoring creates a new draft; published releases stay stable."
        action={
          <Link className="btn btn-secondary" to={'/harnesses/' + id + '/edit'}>
            Back to editor
          </Link>
        }
      />
      {error && <ErrorBox message={error} />}
      <div className="panel p-5 flex flex-wrap gap-4">
        <label>
          Compare from
          <select aria-label="Base revision" value={base} onChange={(e) => setBase(e.target.value)}>
            {items.map((r) => (
              <option key={r.id} value={r.id}>
                r{r.revision} · {r.message}
              </option>
            ))}
          </select>
        </label>
        <label>
          To
          <select
            aria-label="Target revision"
            value={head}
            onChange={(e) => setHead(e.target.value)}
          >
            {items.map((r) => (
              <option key={r.id} value={r.id}>
                r{r.revision} · {r.message}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="secondary"
          disabled={!canRestore || busy || !head}
          onClick={() => void reviewRestore()}
        >
          Review restoration
        </Button>
      </div>
      {restoring && restorePreview && (
        <section className="panel p-5 my-4">
          <p>
            Restore the complete selected revision to a new draft? Download any unsaved editor work
            before continuing. These saved draft files will change:
          </p>
          <ul className="my-3">
            {restorePreview.paths.map((file) => (
              <li key={file}>
                <code>{file}</code>
              </li>
            ))}
          </ul>
          {!restorePreview.paths.length && <p>The saved draft already matches this revision.</p>}
          <Button disabled={busy || !restorePreview.paths.length} onClick={() => void restore()}>
            {busy ? 'Restoring…' : 'Restore selected revision'}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => setRestoring(false)}>
            Cancel
          </Button>
        </section>
      )}
      <div className="my-4 flex flex-wrap gap-2">
        {changes.map((file) => (
          <Button
            key={file}
            variant={file === selected ? 'primary' : 'secondary'}
            onClick={() => setPath(file)}
          >
            {file}
          </Button>
        ))}
      </div>
      {snapshots && selected ? (
        <Suspense fallback={<Loading />}>
          <Diff
            filePath={selected}
            before={snapshots[0].files.find((f) => f.path === selected)?.content ?? ''}
            after={snapshots[1].files.find((f) => f.path === selected)?.content ?? ''}
          />
        </Suspense>
      ) : (
        <p className="my-5">No differences between the selected revisions.</p>
      )}
      <div className="grid gap-3 mt-5">
        {items.map((r) => (
          <section className="panel p-4" key={r.id}>
            <strong>
              r{r.revision} · {r.message}
            </strong>
            <p>
              {r.authorName ?? 'Unknown historical author'} · {r.source} ·{' '}
              {new Date(r.createdAt).toLocaleString()}
            </p>
          </section>
        ))}
      </div>
      {cursor && (
        <Button variant="secondary" disabled={loadingMore} onClick={() => void loadMore()}>
          {loadingMore ? 'Loading history?' : 'Load older revisions'}
        </Button>
      )}
    </>
  );
}
