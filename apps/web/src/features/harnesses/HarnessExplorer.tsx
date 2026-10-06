import { useEffect, useRef, useState, type MouseEvent } from 'react';
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

export type HarnessPathTarget = { path: string; folder: boolean };
export type HarnessFileAction =
  'new-file' | 'new-folder' | 'rename' | 'delete' | 'skill' | 'agent' | 'mcp' | 'hook' | 'settings';

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
  const [menu, setMenu] = useState<{ x: number; y: number; target: HarnessPathTarget } | null>(
    null,
  );
  const menuRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
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
  function closeMenu() {
    setMenu(null);
    returnFocus.current?.focus();
  }
  function openMenu(event: MouseEvent<HTMLElement>, next: HarnessPathTarget) {
    if (!canEdit) return;
    event.preventDefault();
    event.stopPropagation();
    returnFocus.current = event.currentTarget;
    setFolder(next.folder ? next.path : null);
    setMenu({ x: event.clientX, y: event.clientY, target: next });
  }
  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) closeMenu();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };
    window.addEventListener('pointerdown', dismiss);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('keydown', key);
    };
  }, [menu]);
  function toggle(path: string, close?: boolean) {
    setClosed((previous) => {
      const next = new Set(previous);
      (close ?? !previous.has(path)) ? next.add(path) : next.delete(path);
      return next;
    });
  }
  function rows(prefix = '', depth = 0): React.ReactNode {
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
                  className={'harness-explorer-folder ' + (folder === path ? 'selected' : '')}
                  style={{ paddingLeft: 8 + depth * 14 }}
                  aria-label={path + ' folder'}
                  aria-expanded={open}
                  onClick={() => {
                    setFolder(path);
                    toggle(path);
                  }}
                  onContextMenu={(event) => openMenu(event, { path, folder: true })}
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
              className={
                'harness-explorer-row ' +
                (selected === file.path && folder === null ? 'selected' : '')
              }
              onContextMenu={(event) => {
                onSelect(file.path);
                openMenu(event, { path: file.path, folder: false });
              }}
            >
              <button
                className="harness-explorer-file"
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
                <button
                  className="harness-explorer-delete"
                  aria-label={'Delete ' + file.path}
                  title={'Delete ' + file.path}
                  onClick={() => onAction('delete', { path: file.path, folder: false })}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
      </>
    );
  }
  return (
    <div
      className="harness-explorer"
      onContextMenu={(event) => openMenu(event, { path: '', folder: true })}
    >
      <div className="harness-explorer-toolbar">
        <strong>EXPLORER</strong>
        {canEdit && (
          <>
            <button
              aria-label="New file"
              title="New file"
              onClick={() => onAction('new-file', target)}
            >
              <FilePlus2 size={16} />
            </button>
            <button
              aria-label="New folder"
              title="New folder"
              onClick={() => onAction('new-folder', target)}
            >
              <FolderPlus size={16} />
            </button>
            <button
              aria-label="New skill"
              title="New skill"
              onClick={() => onAction('skill', target)}
            >
              <Zap size={16} />
            </button>
            <button
              aria-label="Edit MCP"
              title="Open MCP configuration"
              onClick={() => onAction('mcp', target)}
            >
              <Plug size={16} />
            </button>
          </>
        )}
      </div>
      <input
        className="harness-explorer-filter"
        aria-label="Find a file"
        placeholder="Find a file…"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      />
      <div
        className="harness-explorer-list"
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault();
          const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          buttons[
            (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
          ]?.focus();
        }}
      >
        {rows()}
        {!files.length && <p>Right-click here or use New skill to start.</p>}
      </div>
      {menu && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Explorer actions"
          className="harness-context-menu"
          style={{
            left: Math.max(8, Math.min(menu.x, window.innerWidth - 218)),
            top: Math.max(8, Math.min(menu.y, window.innerHeight - 350)),
          }}
          onContextMenu={(event) => event.preventDefault()}
          onKeyDown={(event) => {
            if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
            event.preventDefault();
            const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
            buttons[
              (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
            ]?.focus();
          }}
        >
          {(
            [
              ['new-file', 'New file…'],
              ['new-folder', 'New folder…'],
              ['skill', 'New skill…'],
              ['agent', 'New agent…'],
              ['mcp', 'Open MCP configuration'],
              ['hook', 'New hook…'],
              ['settings', 'Runtime settings…'],
              ...(menu.target.path
                ? [
                    ['rename', 'Rename…'],
                    ['delete', 'Delete'],
                  ]
                : []),
            ] as [HarnessFileAction, string][]
          ).map(([action, label]) => (
            <button
              key={action}
              role="menuitem"
              onClick={() => {
                onAction(action, menu.target);
                closeMenu();
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
