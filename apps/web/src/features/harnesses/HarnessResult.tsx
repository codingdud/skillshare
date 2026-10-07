import { Link } from 'react-router-dom';
import { ArrowUpRight, Bookmark, Layers } from 'lucide-react';
import { useState } from 'react';
import type { HarnessDiscoveryItem } from '@skillshare/contracts';
import { TypeBadge, TypeIcon, formatDate } from '../../components/ui';
import { RatingSummaryInline } from '../../components/StarRating';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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
  compact = false,
}: {
  item: HarnessDiscoveryItem;
  onChange?: () => void;
  compact?: boolean;
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
    <article
      data-testid="asset-card"
      className={cn(
        'flex min-w-0 rounded-xl border bg-card transition-[border-color,box-shadow] hover:border-brand-border hover:shadow-sm',
        compact ? 'gap-3 p-4' : 'gap-4 px-5 py-5',
      )}
    >
      <div
        className={cn(
          'mt-0.5 flex shrink-0 items-center justify-center rounded-xl',
          compact ? 'size-9' : 'size-11',
          item.type === 'skill' && 'bg-skill-surface text-skill',
          item.type === 'agent' && 'bg-agent-surface text-agent',
          !['skill', 'agent'].includes(item.type) && 'bg-brand-surface text-brand',
        )}
      >
        {item.type === 'harness' ? (
          <Layers size={compact ? 20 : 24} />
        ) : (
          <TypeIcon type={item.type} size={compact ? 20 : 24} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <TypeBadge type={item.type} />
          <span className="font-mono text-xs text-muted-foreground">v{item.version}</span>
          <Badge
            variant="outline"
            className="h-5 rounded-full px-2 font-normal capitalize text-muted-foreground"
          >
            {item.visibility}
          </Badge>
        </div>
        <Link
          className="group flex items-center gap-2 text-base font-semibold leading-normal tracking-tight text-heading hover:text-primary"
          data-testid="asset-title"
          to={harnessResultLink(item)}
        >
          {item.name}
          <ArrowUpRight size={17} className="text-brand opacity-0 group-hover:opacity-100" />
        </Link>
        <p
          className={cn(
            'mt-1 text-sm leading-relaxed text-muted-foreground',
            compact ? 'mb-2 line-clamp-2' : 'mb-3',
          )}
        >
          {item.summary}
        </p>
        {item.path && (
          <p className="mt-2 break-all text-xs text-muted-foreground">
            {item.harnessName} / {item.path}
          </p>
        )}
        {!item.path && (
          <p className="mt-2 text-xs text-muted-foreground">
            {item.fileCount} native files · {item.components.length} components
          </p>
        )}
        <div
          className={cn(
            'flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground',
            compact ? 'mt-2' : 'mt-4',
          )}
          data-testid="asset-meta"
        >
          <Link
            className="hover:text-primary"
            to={'/users/' + item.ownerId}
            title={'View ' + item.ownerName + "'s profile"}
          >
            {item.ownerName}
          </Link>
          <span className="text-text-faint">·</span>
          <span>{item.runtimes.join(', ') || 'Native files'}</span>
          <span className="text-text-faint">·</span>
          <span>Published {formatDate(item.updatedAt)}</span>
          <span className="text-text-faint">·</span>
          <Link
            className="rounded hover:text-primary"
            to={'/harnesses/' + item.harnessId + '/reviews'}
            title="Ratings and reviews"
          >
            <RatingSummaryInline average={item.ratingAverage} count={item.ratingCount} />
          </Link>
        </div>
        {!compact && !item.path && item.components.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {item.components.slice(0, 4).map((component, index) => (
              <Link
                key={component.path + index}
                className="rounded-md border bg-background px-2 py-0.5 text-xs whitespace-nowrap text-muted-foreground hover:text-primary"
                to={harnessResultLink({ ...item, path: component.path })}
              >
                {component.name}
              </Link>
            ))}
            {item.components.length > 4 && (
              <span className="text-xs text-muted-foreground">
                +{item.components.length - 4} more
              </span>
            )}
          </div>
        )}
      </div>
      {user && (
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            '-mt-1 size-9 shrink-0 text-text-faint hover:bg-brand-surface hover:text-primary',
            bookmark.data?.saved && 'text-primary',
          )}
          aria-label={(bookmark.data?.saved ? 'Unsave ' : 'Save ') + item.harnessName}
          aria-pressed={bookmark.data?.saved ?? false}
          disabled={busy || bookmark.loading || !!bookmark.error}
          onClick={() => void toggleBookmark()}
        >
          <Bookmark size={18} fill={bookmark.data?.saved ? 'currentColor' : 'none'} />
        </Button>
      )}
    </article>
  );
}
