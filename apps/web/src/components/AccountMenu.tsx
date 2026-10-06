import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, Pencil, Terminal, UserRound, ShieldCheck } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { notify } from '../app/store';
import { transport, errorMessage } from '../lib/http';
import './account-menu.css';

export function AccountMenu({ onSignedOut }: { onSignedOut?: () => void }) {
  const user = useAppSelector((state) => state.auth.user);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const menu = useRef<HTMLDetailsElement>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (menu.current) menu.current.open = false;
  }, [location.pathname]);
  useEffect(() => {
    function closeOutside(event: PointerEvent) {
      if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false;
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape' && menu.current?.open) {
        menu.current.open = false;
        menu.current.querySelector('summary')?.focus();
      }
    }
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', escape);
    };
  }, []);
  if (!user) return null;
  async function logout() {
    setBusy(true);
    try {
      await transport.logout();
      onSignedOut?.();
      navigate('/');
    } catch (error) {
      dispatch(notify(errorMessage(error)));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details ref={menu} className="account-menu">
      <summary className="profile-button" aria-label="Account menu" title="Account menu">
        <span className="avatar">{user.name[0]?.toUpperCase()}</span>
        <ChevronDown size={14} />
      </summary>
      <div className="account-menu-panel">
        <div className="account-menu-identity">
          <strong>{user.name}</strong>
          <span>{user.email}</span>
        </div>
        <Link to="/profile">
          <UserRound size={16} /> Your profile
        </Link>
        <Link to="/profile/edit">
          <Pencil size={16} /> Edit profile
        </Link>
        <Link to="/devices">
          <Terminal size={16} /> Connected devices
        </Link>
        {user.role === 'admin' && (
          <Link to="/admin">
            <ShieldCheck size={16} /> Administration
          </Link>
        )}
        <button type="button" disabled={busy} onClick={() => void logout()}>
          <LogOut size={16} />
          {busy ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </details>
  );
}
