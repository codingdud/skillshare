import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export function AuthShell({
  backTo,
  backLabel,
  icon: Icon,
  eyebrow,
  title,
  description,
  children,
}: {
  backTo: string;
  backLabel: string;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto my-6 w-full max-w-lg sm:my-12">
      <Card className="[--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
        <CardContent className="grid gap-6">
          <Link
            to={backTo}
            className="inline-flex min-h-8 w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft size={15} aria-hidden="true" />
            {backLabel}
          </Link>
          <div>
            <div className="mb-5 grid size-12 place-items-center rounded-xl bg-brand-surface text-brand">
              <Icon size={24} aria-hidden="true" />
            </div>
            <p className="mb-2 text-[11px] font-semibold tracking-widest text-muted-foreground">
              {eyebrow}
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
            <p className="mt-3 text-muted-foreground">{description}</p>
          </div>
          {children}
        </CardContent>
      </Card>
    </div>
  );
}

export function InfoNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-r-md border-l-2 border-border-strong bg-muted px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}
