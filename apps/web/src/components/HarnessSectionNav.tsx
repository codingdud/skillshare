import { useLocation } from 'react-router-dom';
import { useAppSelector } from '../app/hooks';
import { UnderlineNav } from './UnderlineNav';
import { cn } from '@/lib/utils';

const harnessPage = /^\/harnesses\/([^/]+)\/(edit|history|changes|cli|reviews)$/;

export function HarnessSectionNav({ className }: { className?: string }) {
  const user = useAppSelector((s) => s.auth.user);
  const { pathname } = useLocation();
  const match = harnessPage.exec(pathname);
  if (!match || match[1] === 'new') return null;
  const [, id, page] = match;
  const base = `/harnesses/${id}`;
  const items = [
    { to: `${base}/edit`, label: 'Editor', active: page === 'edit' },
    ...(user
      ? [
          { to: `${base}/history`, label: 'History', active: page === 'history' },
          { to: `${base}/changes`, label: 'Changes & access', active: page === 'changes' },
        ]
      : []),
    { to: `${base}/reviews`, label: 'Reviews', active: page === 'reviews' },
    { to: `${base}/cli`, label: 'Use with CLI', active: page === 'cli' },
  ];
  return (
    <UnderlineNav
      label="Harness sections"
      items={items}
      className={cn('border-t px-4 md:px-7 lg:px-10', className)}
    />
  );
}
