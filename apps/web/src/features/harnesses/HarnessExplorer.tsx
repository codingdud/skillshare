import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  FilePlus2,
  Folder,
  FolderPlus,
  Plug,
  Trash2,
  Zap,
} from 'lucide-react';
import type { HarnessTreeFile } from '@skillshare/contracts';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export type HarnessPathTarget = { path: string; folder: boolean };
export type HarnessFileAction =
  'new-file' | 'new-folder' | 'rename' | 'delete' | 'skill' | 'agent' | 'mcp' | 'hook' | 'settings';

const menuItems: [HarnessFileAction, string][] = [
  ['new-file', 'New file…'],
  ['new-folder', 'New folder…'],
  ['skill', 'New skill…'],
  ['agent', 'New agent…'],
  ['mcp', 'Open MCP configuration'],
  ['hook', 'New hook…'],
  ['settings', 'Runtime settings…'],
];
const rowBase =
  'flex min-h-8 w-full min-w-0 items-center gap-1.5 rounded-md border-0 bg-transparent pr-2 text-left font-mono text-xs text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 [&>svg]:shrink-0 [&>span]:truncate';

export function HarnessExplorer({
  files,
  selected,
  onSelect,
  canEdit,
  onAction,
}: {
  files: HarnessTreeFile[];
  selected: string;
  onSelect: (path: string) => void;
  canEdit: boolean;
  onAction: (action: HarnessFileAction, target: HarnessPathTarget) => void;
}) {
  const [closed, setClosed] = useState(new Set<string>());
  const [folder, setFolder] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [menuTarget, setMenuTarget] = useState<HarnessPathTarget>({ path: '', folder: true });
  const target =
    folder !== null ? { path: folder, folder: true } : { path: selected, folder: false };
  useEffect(() => {
    setFolder(null);
    setClosed((previous) => {
      const next = new Set(previous);
      const parts = selected.split('/');
      for (let index = 1; index < parts.length; index++)
        next.delete(parts.slice(0, index).join('/'));
      return next;
    });
  }, [selected]);
  function markMenu(_event: MouseEvent<HTMLElement>, next: HarnessPathTarget) {
    if (!canEdit) return;
    setFolder(next.folder ? next.path : null);
    setMenuTarget(next);
  }
  function toggle(path: string, close?: boolean) {
    setClosed((previous) => {
      const next = new Set(previous);
      (close ?? !previous.has(path)) ? next.add(path) : next.delete(path);
      return next;
    });
  }
  function rows(prefix = '', depth = 0): ReactNode {
    const directories = new Set<string>();
    const own: HarnessTreeFile[] = [];
    for (const file of files) {
      if (!file.path.startsWith(prefix)) continue;
      const rest = file.path.slice(prefix.length),
        slash = rest.indexOf('/');
      if (slash >= 0) directories.add(prefix + rest.slice(0, slash));
      else own.push(file);
    }
    return (
      <>
        {[...directories]
          .sort()
          .filter(
            (path) =>
              !filter ||
              files.some(
                (file) =>
                  file.path.startsWith(path + '/') &&
                  file.path.toLowerCase().includes(filter.toLowerCase()),
              ),
          )
          .map((path) => {
            const open = !!filter || !closed.has(path);
            return (
              <div key={path}>
                <button
                  type="button"
                  className={cn(rowBase, 'text-muted-foreground', folder === path && 'bg-accent')}
                  style={{ paddingLeft: 8 + depth * 14 }}
                  aria-label={path + ' folder'}
                  aria-expanded={open}
                  onClick={() => {
                    setFolder(path);
                    toggle(path);
                  }}
                  onContextMenu={(event) => markMenu(event, { path, folder: true })}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                      event.preventDefault();
                      toggle(path, event.key === 'ArrowLeft');
                    }
                    if (canEdit && event.key === 'F2') {
                      event.preventDefault();
                      onAction('rename', { path, folder: true });
                    }
                  }}
                >
                  {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <Folder size={15} />
                  <span>{path.split('/').at(-1)}</span>
                </button>
                {open && rows(path + '/', depth + 1)}
              </div>
            );
          })}
        {own
          .sort((a, b) => a.path.localeCompare(b.path))
          .filter((file) => file.path.toLowerCase().includes(filter.toLowerCase()))
          .map((file) => (
            <div
              key={file.path}
              className={cn(
                'group/row flex min-w-0 items-center rounded-md hover:bg-muted',
                selected === file.path && folder === null && 'bg-accent text-accent-foreground',
              )}
              onContextMenu={(event) => {
                onSelect(file.path);
                markMenu(event, { path: file.path, folder: false });
              }}
            >
              <button
                type="button"
                className={cn(rowBase, 'min-w-0 flex-1 hover:bg-transparent')}
                style={{ paddingLeft: 24 + depth * 14 }}
                title={file.path}
                aria-label={file.path}
                onClick={() => {
                  setFolder(null);
                  onSelect(file.path);
                }}
                onKeyDown={(event) => {
                  if (canEdit && event.key === 'F2') {
                    event.preventDefault();
                    onAction('rename', { path: file.path, folder: false });
                  }
                  if (canEdit && event.key === 'Delete') {
                    event.preventDefault();
                    onAction('delete', { path: file.path, folder: false });
                  }
                }}
              >
                <FileCode2 size={15} />
                <span>{file.path.split('/').at(-1)}</span>
              </button>
              {canEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="mr-1 text-muted-foreground opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 hover:text-destructive focus-visible:opacity-100"
                  data-testid="harness-explorer-delete"
                  aria-label={'Delete ' + file.path}
                  title={'Delete ' + file.path}
                  onClick={() => onAction('delete', { path: file.path, folder: false })}
                >
                  <Trash2 size={14} />
                </Button>
              )}
            </div>
          ))}
      </>
    );
  }
  return (
    <ContextMenu>
      <ContextMenuTrigger
        asChild
        disabled={!canEdit}
        onContextMenuCapture={() => {
          if (!canEdit) return;
          setFolder('');
          setMenuTarget({ path: '', folder: true });
        }}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-1 px-3 pt-3 pb-2">
            <strong className="flex-1 text-[11px] font-semibold tracking-widest text-muted-foreground">
              EXPLORER
            </strong>
            {canEdit && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="New file"
                  title="New file"
                  onClick={() => onAction('new-file', target)}
                >
                  <FilePlus2 />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="New folder"
                  title="New folder"
                  onClick={() => onAction('new-folder', target)}
                >
                  <FolderPlus />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="New skill"
                  title="New skill"
                  onClick={() => onAction('skill', target)}
                >
                  <Zap />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Edit MCP"
                  title="Open MCP configuration"
                  onClick={() => onAction('mcp', target)}
                >
                  <Plug />
                </Button>
              </>
            )}
          </div>
          <div className="px-3 pb-2">
            <Input
              className="h-8 bg-background text-xs md:text-xs"
              aria-label="Find a file"
              placeholder="Find a file…"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
          </div>
          <ScrollArea className="min-h-0 flex-1 overflow-hidden [&_[data-radix-scroll-area-viewport]>div]:block!">
            <div
              className="grid gap-px px-2 pb-9"
              onKeyDown={(event) => {
                if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
                event.preventDefault();
                const buttons = [
                  ...event.currentTarget.querySelectorAll<HTMLButtonElement>('button'),
                ];
                const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
                buttons[
                  (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
                ]?.focus();
              }}
            >
              {rows()}
              {!files.length && (
                <p className="p-3 text-xs text-muted-foreground">
                  Right-click here or use New skill to start.
                </p>
              )}
            </div>
          </ScrollArea>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent aria-label="Explorer actions" className="w-56">
        {menuItems.map(([action, label]) => (
          <ContextMenuItem key={action} onSelect={() => onAction(action, menuTarget)}>
            {label}
          </ContextMenuItem>
        ))}
        {menuTarget.path && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => onAction('rename', menuTarget)}>
              Rename…
            </ContextMenuItem>
            <ContextMenuItem variant="destructive" onSelect={() => onAction('delete', menuTarget)}>
              Delete
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
