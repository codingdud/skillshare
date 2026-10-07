import { Children, cloneElement, isValidElement, useId } from 'react';
import type { ReactNode, ButtonHTMLAttributes, ReactElement } from 'react';
import {
  ArrowRight,
  Bot,
  Layers,
  Workflow,
  Zap,
  AlertCircle,
  LoaderCircle,
  Plug,
  Settings2,
  Webhook,
} from 'lucide-react';
import { assetModules, type AssetType } from '@skillshare/contracts';
import { Badge } from '@/components/ui/badge';
import { Button as ShadButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type BadgeType = AssetType | 'harness';
const typeBadgeVariants: Record<BadgeType, string> = {
  skill: 'bg-skill-surface text-skill',
  agent: 'bg-agent-surface text-agent',
  workflow: 'bg-workflow-surface text-workflow',
  harness: 'bg-brand-surface text-brand',
  mcp: 'bg-variant-surface text-variant',
  hook: 'bg-warning-surface text-warning',
  settings: 'bg-muted text-muted-foreground',
};
const buttonVariants = { primary: 'default', secondary: 'outline', ghost: 'ghost' } as const;
const fieldControls = new Set<unknown>(['input', 'select', 'textarea', Input, Textarea]);

export function TypeIcon({ type, size = 20 }: { type: BadgeType; size?: number }) {
  const Icon =
    type === 'skill'
      ? Zap
      : type === 'agent'
        ? Bot
        : type === 'workflow'
          ? Workflow
          : type === 'mcp'
            ? Plug
            : type === 'hook'
              ? Webhook
              : type === 'settings'
                ? Settings2
                : Layers;
  return <Icon size={size} aria-hidden="true" />;
}
export function TypeBadge({ type }: { type: BadgeType }) {
  return (
    <Badge
      variant="secondary"
      data-type={type}
      className={cn('h-6 gap-1.5 px-2.5 font-semibold', typeBadgeVariants[type])}
    >
      <TypeIcon type={type} size={13} />
      {type === 'harness' ? 'Harness' : assetModules[type].label}
    </Badge>
  );
}
export function Button({
  children,
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  children: ReactNode;
}) {
  return (
    <ShadButton
      variant={buttonVariants[variant]}
      size="lg"
      className={cn('h-10 gap-2 px-4 font-semibold', className)}
      {...props}
    >
      {children}
    </ShadButton>
  );
}
export function ErrorBox({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
    >
      <AlertCircle size={18} className="mt-0.5 shrink-0" />
      <div>
        <p>{message}</p>
        {retry && (
          <button type="button" className="mt-2 underline" onClick={retry}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
export function Loading() {
  return (
    <div role="status" className="flex justify-center gap-3 py-20 text-muted-foreground">
      <LoaderCircle className="animate-spin" size={20} />
      Loading your next building block…
    </div>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed bg-card px-6 py-12 text-center">
      <div className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-brand-surface text-brand">
        <Layers />
      </div>
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <p className="mt-2 mb-5 text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="mb-5 grid gap-2">
      <Label htmlFor={id} className="font-semibold">
        {label}
      </Label>
      {Children.map(children, (child) =>
        isValidElement(child) && fieldControls.has(child.type)
          ? cloneElement(child as ReactElement<{ id?: string; 'aria-describedby'?: string }>, {
              id,
              'aria-describedby': hintId,
            })
          : child,
      )}
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
export function Tags({ tags }: { tags: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <Badge
          key={tag}
          variant="outline"
          className="h-6 rounded-md bg-background px-2 font-normal text-muted-foreground"
        >
          {tag}
        </Badge>
      ))}
    </div>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && (
          <p className="mb-2 text-[11px] font-semibold tracking-widest text-brand">{eyebrow}</p>
        )}
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
export const Arrow = () => <ArrowRight size={16} aria-hidden="true" />;
export function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(value),
  );
}
