import { useLocation } from 'react-router-dom';
import { Activity, Bookmark, Compass, FolderGit2, ShieldCheck, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAppSelector } from '../app/hooks';
import type { UnderlineNavItem } from './UnderlineNav';

const links: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/', label: 'Explore', icon: Compass },
  { to: '/harnesses', label: 'My Harnesses', icon: FolderGit2 },
  { to: '/saved', label: 'Saved', icon: Bookmark },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/organizations', label: 'Organizations', icon: Users },
  { to: '/admin', label: 'Administration', icon: ShieldCheck },
];

export function useNavLinks(): UnderlineNavItem[] {
  const user = useAppSelector((s) => s.auth.user);
  const { pathname } = useLocation();
  return links
    .filter(({ to }) => (to === '/' ? true : to === '/admin' ? user?.role === 'admin' : !!user))
    .map((link) => ({
      ...link,
      active: link.to === '/' ? pathname === '/' : pathname === link.to || pathname.startsWith(`${link.to}/`),
    }));
}
