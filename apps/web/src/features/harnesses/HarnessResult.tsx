import { Link } from 'react-router-dom';
import { ArrowUpRight, Bookmark, Layers } from 'lucide-react';
import { useState } from 'react';
import type { HarnessDiscoveryItem } from '@skillshare/contracts';
import { TypeIcon, formatDate } from '../../components/ui';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { notify } from '../../app/store';
import { api, errorMessage } from '../../lib/http';
import { useResource } from '../../lib/useResource';

export function harnessResultLink(item: HarnessDiscoveryItem) {
  const query = new URLSearchParams({ release: item.releaseId });
  if (item.path) query.set('file', item.path);
  return '/harnesses/' + item.harnessId + '/edit?' + query;
}
export function HarnessResult({
  item,
  onChange,
}: {
  item: HarnessDiscoveryItem;
  onChange?: () => void;
}) {
  const user = useAppSelector((s) => s.auth.user),
    dispatch = useAppDispatch();
  const bookmark = useResource<{ saved: boolean }>(
    user ? '/harnesses/' + item.harnessId + '/save' : null,
  );
  const [busy, setBusy] = useState(false);
  async function toggleBookmark() {
    setBusy(true);
    try {
      await api.request({
        url: '/harnesses/' + item.harnessId + '/save',
        method: bookmark.data?.saved ? 'DELETE' : 'PUT',
      });
      bookmark.setData({ saved: !bookmark.data?.saved });
      onChange?.();
    } catch (error) {
      dispatch(notify(errorMessage(error)));
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="asset-card">
      <div className={'asset-icon icon-' + item.type}>
        {item.type === 'harness' ? <Layers size={24} /> : <TypeIcon type={item.type} size={24} />}
      </div>
      <div className="asset-card-main">
        <div className="flex items-center gap-2 mb-2">
          <span className={'type-badge type-' + item.type}>
            {item.type === 'harness'
              ? 'Harness'
              : item.type === 'mcp'
                ? 'MCP'
                : item.type === 'hook'
                  ? 'Hook'
                  : item.type === 'settings'
                    ? 'Settings'
                    : item.type === 'skill'
                      ? 'Skill'
                      : 'Agent'}
          </span>
          <span className="version">v{item.version}</span>
          <span className="visibility">{item.visibility}</span>
        </div>
        <Link className="asset-title" to={harnessResultLink(item)}>
          {item.name}
          <ArrowUpRight size={17} />
        </Link>
        <p className="asset-summary">{item.summary}</p>
        {item.path && (
          <p className="text-xs text-slate-500 mt-2 break-all">
            {item.harnessName} / {item.path}
          </p>
        )}
        {!item.path && (
          <p className="text-xs text-slate-500 mt-2">
            {item.fileCount} native files · {item.components.length} components
          </p>
        )}
        <div className="asset-meta">
          <Link to={'/users/' + item.ownerId} title={'View ' + item.ownerName + "'s profile"}>
            {item.ownerName}
          </Link>
          <span className="meta-dot">·</span>
          <span>{item.runtimes.join(', ') || 'Native files'}</span>
          <span className="meta-dot">·</span>
          <span>Published {formatDate(item.updatedAt)}</span>
        </div>
        {!item.path && item.components.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {item.components.slice(0, 4).map((component, index) => (
              <Link
                key={component.path + index}
                className="tag"
                to={harnessResultLink({ ...item, path: component.path })}
              >
                {component.name}
              </Link>
            ))}
            {item.components.length > 4 && (
              <span className="text-xs text-slate-500">+{item.components.length - 4} more</span>
            )}
          </div>
        )}
      </div>
      {user && (
        <button
          className="save-button"
          aria-label={(bookmark.data?.saved ? 'Unsave ' : 'Save ') + item.harnessName}
          aria-pressed={bookmark.data?.saved ?? false}
          disabled={busy || bookmark.loading || !!bookmark.error}
          onClick={() => void toggleBookmark()}
        >
          <Bookmark size={18} fill={bookmark.data?.saved ? 'currentColor' : 'none'} />
        </button>
      )}
    </article>
  );
}
