import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Moon, Plus, Search, Sun } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { setTheme } from '../app/store';
import { saveTheme } from '../app/theme';
import { useNavLinks } from './MainNav';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Action = { id: string; label: string; icon: LucideIcon; group: string; run: () => void };

function typing(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const theme = useAppSelector((s) => s.ui.theme);
  const user = useAppSelector((s) => s.auth.user);
  const links = useNavLinks();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpenChange(true);
      } else if (event.key === '/' && !typing(event.target) && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        onOpenChange(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpenChange]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
    }
  }, [open]);

  const actions = useMemo(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    const list: Action[] = [];
    const term = query.trim();
    if (term)
      list.push({
        id: 'search',
        label: `Search SkillShare for "${term}"`,
        icon: Search,
        group: 'Search',
        run: () => navigate(`/?q=${encodeURIComponent(term)}`),
      });
    for (const link of links)
      list.push({
        id: link.to,
        label: link.label,
        icon: link.icon ?? Search,
        group: 'Go to',
        run: () => navigate(link.to),
      });
    if (user)
      list.push({
        id: 'create',
        label: 'Create Harness',
        icon: Plus,
        group: 'Actions',
        run: () => navigate('/harnesses/new'),
      });
    list.push({
      id: 'theme',
      label: `Switch to ${next} mode`,
      icon: next === 'dark' ? Moon : Sun,
      group: 'Actions',
      run: () => {
        saveTheme(next);
        dispatch(setTheme(next));
      },
    });
    const needle = term.toLowerCase();
    return list.filter((a) => a.id === 'search' || !needle || a.label.toLowerCase().includes(needle));
  }, [query, links, user, theme, navigate, dispatch]);

  const active = Math.min(index, Math.max(0, actions.length - 1));
  function choose(action: Action | undefined) {
    if (!action) return;
    onOpenChange(false);
    action.run();
  }
  let lastGroup = '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="top-[20%] translate-y-0 gap-0 p-0 sm:max-w-lg">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Search SkillShare or jump to a page.
        </DialogDescription>
        <div className="flex items-center gap-2 border-b px-3">
          <Search size={16} aria-hidden="true" className="text-muted-foreground" />
          <Input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="command-list"
            aria-label="Command palette search"
            placeholder="Search or jump to…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setIndex((active + 1) % actions.length);
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setIndex((active - 1 + actions.length) % actions.length);
              } else if (event.key === 'Enter') {
                event.preventDefault();
                choose(actions[active]);
              }
            }}
            className="h-12 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <ul id="command-list" role="listbox" className="max-h-80 overflow-y-auto p-2">
          {actions.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">No results.</li>
          )}
          {actions.map((action, i) => {
            const header = action.group !== lastGroup;
            lastGroup = action.group;
            const Icon = action.icon;
            return (
              <li key={action.id} role="presentation">
                {header && (
                  <div className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
                    {action.group}
                  </div>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => setIndex(i)}
                  onClick={() => choose(action)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm',
                    i === active && 'bg-accent text-accent-foreground',
                  )}
                >
                  <Icon size={16} aria-hidden="true" className="text-muted-foreground" />
                  <span className="truncate">{action.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
