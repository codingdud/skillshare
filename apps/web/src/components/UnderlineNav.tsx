import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type UnderlineNavItem = {
  to: string;
  label: string;
  icon?: LucideIcon;
  active: boolean;
};

export function UnderlineNav({
  label,
  items,
  className,
}: {
  label: string;
  items: UnderlineNavItem[];
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn('overflow-x-auto', className)}>
      <ul className="flex min-w-max items-end gap-1">
        {items.map(({ to, label: text, icon: Icon, active }) => (
          <li key={to}>
            <Link
              to={to}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex h-11 items-center gap-2 rounded-md px-3 text-sm outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50',
                active
                  ? 'font-semibold text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {Icon && <Icon size={16} aria-hidden="true" />}
              {text}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
