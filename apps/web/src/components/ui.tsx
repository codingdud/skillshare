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
export function TypeIcon({ type, size = 20 }: { type: AssetType | 'harness'; size?: number }) {
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
export function TypeBadge({ type }: { type: AssetType | 'harness' }) {
  return (
    <span className={`type-badge type-${type}`}>
      <TypeIcon type={type} size={13} />
      {type === 'harness' ? 'Harness' : assetModules[type].label}
    </span>
  );
}
export function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  children: ReactNode;
}) {
  return (
    <button className={`btn btn-${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
export function ErrorBox({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div role="alert" className="error-box">
      <AlertCircle size={18} />
      <div>
        <p>{message}</p>
        {retry && (
          <button className="underline mt-2" onClick={retry}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
export function Loading() {
  return (
    <div role="status" className="py-20 flex justify-center gap-3 text-slate-500">
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
    <div className="empty-state">
      <div className="icon-tile mx-auto mb-4">
        <Layers />
      </div>
      <h2>{title}</h2>
      <p className="mt-2 mb-5 text-slate-500">{description}</p>
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
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {Children.map(children, (child) =>
        isValidElement(child) && ['input', 'select', 'textarea'].includes(String(child.type))
          ? cloneElement(child as ReactElement<{ id?: string; 'aria-describedby'?: string }>, {
              id,
              'aria-describedby': hintId,
            })
          : child,
      )}
      {hint && <small id={hintId}>{hint}</small>}
    </div>
  );
}
export function Tags({ tags }: { tags: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <span className="tag" key={tag}>
          {tag}
        </span>
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
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="mt-2 text-slate-500 max-w-2xl">{description}</p>}
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
