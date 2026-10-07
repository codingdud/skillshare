import { useEffect, useMemo, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { toast } from 'sonner';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { notify } from '../app/store';
import { AppHeader } from './AppHeader';
import { LayoutModeContext, type LayoutMode } from '@/hooks/use-layout-mode';
import { cn } from '@/lib/utils';

function Shell({ mode }: { mode: LayoutMode }) {
  const expanded = mode === 'editor-expanded';
  const editor = mode !== 'default';
  return (
    <div
      className={cn('flex min-h-dvh min-w-0 flex-col', editor && 'h-dvh overflow-hidden')}
      data-layout-mode={mode}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-skip focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      {!expanded && <AppHeader />}
      <main
        id="main"
        tabIndex={-1}
        className={cn(
          'w-full flex-1 outline-none',
          editor
            ? 'min-h-0 min-w-0 overflow-hidden p-2'
            : 'mx-auto max-w-[1536px] px-4 pt-7 pb-12 md:px-7 lg:px-10 lg:pt-9 lg:pb-14',
        )}
      >
        <Outlet />
      </main>
      {!editor && (
        <footer className="flex flex-wrap justify-between gap-2 border-t px-4 py-5 text-[11px] text-muted-foreground md:px-7 lg:px-10">
          <span>
            SkillShare <span className="mx-2">/</span> Discover. Adapt. Share.
          </span>
          <span>Built with attribution in mind.</span>
        </footer>
      )}
    </div>
  );
}

export function Layout() {
  const notice = useAppSelector((s) => s.ui.notice);
  const dispatch = useAppDispatch();
  const [mode, setMode] = useState<LayoutMode>('default');
  const modeValue = useMemo(() => ({ mode, setMode }), [mode]);
  useEffect(() => {
    if (!notice) return;
    toast(<span role="status">{notice}</span>, { id: 'app-notice', duration: 6000, closeButton: true });
    dispatch(notify(''));
  }, [notice, dispatch]);
  return (
    <LayoutModeContext.Provider value={modeValue}>
      <Shell mode={mode} />
    </LayoutModeContext.Provider>
  );
}
