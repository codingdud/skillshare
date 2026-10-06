import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Compass,
  FolderGit2,
  Bookmark,
  Activity,
  Users,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  Menu,
  X,
  Command,
  GitBranch,
  Sun,
  Moon,
  ShieldCheck,
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { notify, setSidebarCollapsed, setTheme } from '../app/store';
import { saveTheme } from '../app/theme';
import { AccountMenu } from './AccountMenu';
import './layout-sidebar.css';
const links = [
  { to: '/', label: 'Explore', icon: Compass },
  { to: '/harnesses', label: 'My Harnesses', icon: FolderGit2 },
  { to: '/saved', label: 'Saved', icon: Bookmark },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/organizations', label: 'Organizations', icon: Users },
];
export function Layout() {
  const theme = useAppSelector((s) => s.ui.theme);
  const collapsed = useAppSelector((s) => s.ui.sidebarCollapsed);
  const user = useAppSelector((s) => s.auth.user),
    notice = useAppSelector((s) => s.ui.notice),
    dispatch = useAppDispatch(),
    navigate = useNavigate();
  const [mobile, setMobile] = useState(false),
    [search, setSearch] = useState('');
  useEffect(() => {
    try {
      localStorage.setItem('skillshare-sidebar-collapsed', String(collapsed));
    } catch {
      /* The layout also works without browser storage. */
    }
  }, [collapsed]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => dispatch(notify('')), 6000);
    return () => clearTimeout(timer);
  }, [notice, dispatch]);
  return (
    <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <button
        type="button"
        className="sidebar-chevron"
        aria-label={collapsed ? 'Expand navigation sidebar' : 'Collapse navigation sidebar'}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-expanded={!collapsed}
        aria-controls="app-navigation"
        onClick={() => dispatch(setSidebarCollapsed(!collapsed))}
      >
        {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>
      <aside id="app-navigation" className={`sidebar ${mobile ? 'sidebar-open' : ''}`}>
        <Link
          to="/"
          className="brand"
          aria-label="SkillShare home"
          title="SkillShare home"
          onClick={() => setMobile(false)}
        >
          <span className="brand-mark">
            <GitBranch size={22} />
          </span>
          <span className="brand-name">SkillShare</span>
          <span className="beta">BETA</span>
        </Link>
        <button
          className="mobile-close"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        >
          <X />
        </button>
        <Link
          to={user ? '/profile' : '/'}
          className="workspace-label"
          title={user ? 'Open your profile' : 'Explore public Harnesses'}
          aria-label={user ? 'Open your profile' : 'Explore public Harnesses'}
          onClick={() => setMobile(false)}
        >
          <span className="avatar">{user?.name[0] ?? 'S'}</span>
          <div>
            <strong>
              {user ? `${user.name.split(' ')[0]}'s workspace` : 'Community workspace'}
            </strong>
            <small>{user ? 'Personal account' : 'Explore public Harnesses'}</small>
          </div>
        </Link>
        <div className="nav-caption">{user ? 'WORKSPACE' : 'DISCOVER'}</div>
        <nav aria-label="Main navigation">
          {[
            ...links,
            ...(user?.role === 'admin'
              ? [{ to: '/admin', label: 'Administration', icon: ShieldCheck }]
              : []),
          ]
            .filter(({ to }) => user || to === '/')
            .map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                aria-label={label}
                title={label}
                onClick={() => setMobile(false)}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon size={19} />
                <span className="nav-label">{label}</span>
                {to === '/' && <span className="nav-dot" />}
              </NavLink>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="mini-icon">
              <GitBranch size={18} />
            </span>
            <strong>Better, together.</strong>
            <p>Your next great idea might start with someone else's.</p>
            {user && (
              <Link to="/harnesses/new">
                Create a Harness <ArrowUpRight size={14} />
              </Link>
            )}
          </div>
          <div className="sidebar-footer">
            <span className="status-dot" />
            Built for builders<span>v0.1</span>
          </div>
        </div>
      </aside>
      {mobile && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <button
            className="mobile-menu"
            aria-label="Open navigation"
            onClick={() => {
              dispatch(setSidebarCollapsed(false));
              setMobile(true);
            }}
          >
            <Menu size={22} />
          </button>
          <div className="breadcrumb">
            <span>Community</span>
            <span>/</span>
            <strong>Build on what works</strong>
          </div>
          <form
            className="global-search"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(`/?q=${encodeURIComponent(search)}`);
            }}
          >
            <Search size={16} />
            <input
              aria-label="Global search"
              placeholder="Search SkillShare…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <kbd>
              <Command size={11} /> K
            </kbd>
          </form>
          <button
            type="button"
            className="theme-toggle"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            onClick={() => {
              const next = theme === 'dark' ? 'light' : 'dark';
              saveTheme(next);
              dispatch(setTheme(next));
            }}
          >
            {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
          </button>
          {user && (
            <Link className="btn btn-primary" to="/harnesses/new">
              <Plus size={16} />
              Create Harness
            </Link>
          )}
          {user ? (
            <AccountMenu onSignedOut={() => setMobile(false)} />
          ) : (
            <Link className="signin-link" to="/login">
              Sign in
            </Link>
          )}
        </header>
        <main id="main" className="main-content">
          <Outlet />
        </main>
        <footer className="page-footer">
          <span>
            SkillShare <span className="mx-2">/</span> Discover. Adapt. Share.
          </span>
          <span>Built with attribution in mind.</span>
        </footer>
      </div>
      {notice && (
        <div role="status" className="toast">
          {notice}
          <button aria-label="Dismiss notification" onClick={() => dispatch(notify(''))}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
