import { useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Stars({
  value,
  size = 14,
  className,
}: {
  value: number;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-flex items-center gap-0.5 text-amber-500', className)}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.max(0, Math.min(1, value - (n - 1)));
        return (
          <span key={n} className="relative inline-block" style={{ width: size, height: size }}>
            <Star size={size} className="absolute inset-0 text-border-strong" />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star size={size} className="fill-current" />
            </span>
          </span>
        );
      })}
    </span>
  );
}

export function RatingSummaryInline({
  average,
  count,
  className,
}: {
  average: number | null;
  count: number;
  className?: string;
}) {
  if (!count || average === null)
    return (
      <span data-testid="rating-inline" className={cn('text-xs text-muted-foreground', className)}>
        Not rated yet
      </span>
    );
  return (
    <span
      data-testid="rating-inline"
      className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', className)}
      role="img"
      aria-label={`Rated ${average.toFixed(1)} out of 5 from ${count} ${count === 1 ? 'review' : 'reviews'}`}
    >
      <span aria-hidden="true" className="font-semibold text-foreground">
        {average.toFixed(1)}
      </span>
      <Stars value={average} size={13} />
      <span aria-hidden="true">({count})</span>
    </span>
  );
}

const labels = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

export function StarInput({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex items-center gap-3">
      <div
        role="radiogroup"
        aria-label="Your rating"
        className="flex gap-1"
        onMouseLeave={() => setHover(0)}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} ${n === 1 ? 'star' : 'stars'}, ${labels[n - 1]}`}
            tabIndex={value === n || (!value && n === 1) ? 0 : -1}
            disabled={disabled}
            className="rounded p-0.5 text-amber-500 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange(n)}
            onKeyDown={(event) => {
              const forward = event.key === 'ArrowRight' || event.key === 'ArrowUp';
              const back = event.key === 'ArrowLeft' || event.key === 'ArrowDown';
              if (!forward && !back) return;
              event.preventDefault();
              const next = forward ? Math.min(5, n + 1) : Math.max(1, n - 1);
              onChange(next);
              event.currentTarget.parentElement
                ?.querySelectorAll<HTMLElement>('[role="radio"]')
                [next - 1]?.focus();
            }}
          >
            <Star size={28} className={cn(n <= shown ? 'fill-current' : 'text-border-strong')} />
          </button>
        ))}
      </div>
      <span className="min-w-20 text-sm text-muted-foreground">
        {shown ? labels[shown - 1] : 'Select a rating'}
      </span>
    </div>
  );
}
