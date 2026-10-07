import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Command, GitBranch, Menu, Moon, Plus, Search, Sun } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { setTheme } from '../app/store';
import { saveTheme } from '../app/theme';
import { AccountMenu } from './AccountMenu';
import { CommandPalette } from './CommandPalette';
import { HarnessSectionNav } from './HarnessSectionNav';
import { useNavLinks } from './MainNav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const pageTitles: [RegExp, string][] = [
  [/^\/$/, 'Explore'],
  [/^\/login$/, 'Sign in'],
  [/^\/verify-email$/, 'Verify email'],
  [/^\/forgot-password$/, 'Reset password'],
  [/^\/admin/, 'Administration'],
  [/^\/profile\/edit$/, 'Edit profile'],
  [/^\/(profile|users\/[^/]+)$/, 'Profile'],
  [/^\/device$/, 'Device approval'],
  [/^\/devices$/, 'Devices'],
  [/^\/harnesses$/, 'My Harnesses'],
  [/^\/harnesses\/new$/, 'New Harness'],
  [/^\/harnesses\/[^/]+\/edit$/, 'Harness editor'],
  [/^\/harnesses\/[^/]+\/history$/, 'Harness history'],
  [/^\/harnesses\/[^/]+\/changes$/, 'Changes & access'],
  [/^\/harnesses\/[^/]+\/cli$/, 'Use with CLI'],
  [/^\/harnesses\/[^/]+\/reviews$/, 'Reviews'],
  [/^\/saved/, 'Saved'],
  [/^\/activity/, 'Activity'],
  [/^\/organizations/, 'Organizations'],
];

function pageTitle(pathname: string) {
  return pageTitles.find(([pattern]) => pattern.test(pathname))?.[1] ?? 'SkillShare';
}

export function AppHeader() {
  const theme = useAppSelector((s) => s.ui.theme);
  const user = useAppSelector((s) => s.auth.user);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const links = useNavLinks();
  const [search, setSearch] = useState('');
  const [menu, setMenu] = useState(false);
  const [palette, setPalette] = useState(false);
  const next = theme === 'dark' ? 'light' : 'dark';
  useEffect(() => setMenu(false), [pathname]);
  return (
    <header
      data-testid="topbar"
      className="sticky top-0 z-topbar shrink-0 border-b bg-card/90 backdrop-blur-md"
    >
      <div className="flex h-16 items-center gap-2 px-4 md:gap-3 md:px-7 lg:px-10">
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          className="border-border-strong"
          aria-label="Open navigation"
          aria-expanded={menu}
          aria-controls="mobile-navigation"
          onClick={() => setMenu(true)}
        >
          <Menu />
        </Button>
        <Link
          to="/"
          aria-label="SkillShare home"
          title="SkillShare home"
          className="flex shrink-0 items-center gap-2.5 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <GitBranch size={20} />
          </span>
          <span
            data-testid="page-title"
            className="hidden max-w-48 truncate text-lg font-bold tracking-tight text-text-strong sm:inline"
          >
            {pageTitle(pathname)}
          </span>
          <Badge variant="secondary" className="hidden h-4 px-1.5 text-[9px] font-bold sm:inline-flex">
            BETA
          </Badge>
        </Link>
        <form
          className="relative ml-auto hidden min-w-0 max-w-md flex-1 md:ml-4 md:block"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(`/?q=${encodeURIComponent(search)}`);
          }}
        >
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Global search"
            placeholder="Search SkillShare…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 bg-background pr-14 pl-9"
          />
          <kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 items-center gap-0.5 rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground lg:inline-flex">
            <Command size={11} /> K
          </kbd>
        </form>
        <div className="ml-auto flex items-center gap-1.5 md:gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            className="md:hidden"
            aria-label="Search"
            onClick={() => setPalette(true)}
          >
            <Search />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            aria-label={`Switch to ${next} mode`}
            title={`Switch to ${next} mode`}
            onClick={() => {
              saveTheme(next);
              dispatch(setTheme(next));
            }}
          >
            {theme === 'dark' ? <Sun /> : <Moon />}
          </Button>
          {user && (
            <Button asChild className="h-9 gap-2 px-3 font-semibold sm:px-4">
              <Link to="/harnesses/new" aria-label="Create Harness">
                <Plus />
                <span className="hidden sm:inline">Create Harness</span>
              </Link>
            </Button>
          )}
          {user ? (
            <AccountMenu onSignedOut={() => setMenu(false)} />
          ) : (
            <Button asChild variant="outline" className="h-9 px-4 font-semibold">
              <Link to="/login">Sign in</Link>
            </Button>
          )}
        </div>
      </div>
      <HarnessSectionNav />
      <Sheet open={menu} onOpenChange={setMenu}>
        <SheetContent side="left" id="mobile-navigation" className="w-72 gap-0 p-0">
          <SheetHeader className="border-b p-4">
            <SheetTitle>Navigation</SheetTitle>
            <SheetDescription className="sr-only">Main site navigation</SheetDescription>
          </SheetHeader>
          <nav aria-label="Main navigation" className="grid gap-1 p-3">
            {links.map(({ to, label, icon: Icon, active }) => (
              <Link
                key={to}
                to={to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-11 items-center gap-3 rounded-md px-3 text-sm outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50',
                  active ? 'bg-accent font-semibold text-foreground' : 'text-muted-foreground',
                )}
              >
                {Icon && <Icon size={18} aria-hidden="true" />}
                {label}
              </Link>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
      <CommandPalette open={palette} onOpenChange={setPalette} />
    </header>
  );
}
