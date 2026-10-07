import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import type { HarnessRating, HarnessRatingsPage } from '@skillshare/contracts';
import { api, errorMessage } from '../../lib/http';
import { useResource } from '../../lib/useResource';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { notify } from '../../app/store';
import { ErrorBox, Loading, formatDate } from '../../components/ui';
import { Stars, StarInput } from '../../components/StarRating';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

function ReviewItem({ review, mine }: { review: HarnessRating; mine: boolean }) {
  return (
    <li data-testid="review-item" className="grid gap-1.5 py-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link
          to={'/users/' + review.userId}
          className="text-sm font-semibold text-heading hover:text-brand"
        >
          {review.userName}
        </Link>
        {mine && (
          <span className="rounded-full bg-brand-surface px-2 text-xs text-brand">You</span>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Stars value={review.rating} size={14} />
        <span className="sr-only">Rated {review.rating} out of 5</span>
        <time dateTime={review.updatedAt}>{formatDate(review.updatedAt)}</time>
      </div>
      {review.body && (
        <p className="max-w-prose text-sm leading-relaxed whitespace-pre-line text-foreground">
          {review.body}
        </p>
      )}
    </li>
  );
}

export function HarnessReviewsPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const head = useResource<{ name: string }>('/harnesses/' + id);
  const ratings = useResource<HarnessRatingsPage>(
    '/harnesses/' + id + '/ratings?page=' + page + '&u=' + (user?.id ?? ''),
  );
  const [stars, setStars] = useState(0);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const mine = ratings.data?.mine ?? null;
  useEffect(() => {
    setStars(mine?.rating ?? 0);
    setBody(mine?.body ?? '');
  }, [mine?.id, mine?.updatedAt]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!stars) return setFormError('Choose a star rating before posting.');
    setBusy(true);
    setFormError('');
    try {
      await api.put('/harnesses/' + id + '/ratings/me', { rating: stars, body });
      dispatch(notify(mine ? 'Review updated.' : 'Thanks for rating this Harness.'));
      ratings.reload();
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setFormError('');
    try {
      await api.delete('/harnesses/' + id + '/ratings/me');
      setStars(0);
      setBody('');
      dispatch(notify('Your review was deleted.'));
      ratings.reload();
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (head.loading || (ratings.loading && !ratings.data)) return <Loading />;
  if (head.error || ratings.error || !head.data || !ratings.data)
    return <ErrorBox message={head.error || ratings.error} retry={ratings.reload} />;
  const { summary, items, canRate, total, pageSize } = ratings.data;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-8">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link to={'/harnesses/' + id + '/edit'}>
            <ArrowLeft /> {head.data.name}
          </Link>
        </Button>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-heading">
          Ratings and reviews
        </h1>
      </div>
      <section
        aria-label="Rating summary"
        data-testid="rating-summary"
        className="grid gap-6 rounded-xl border bg-card p-5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:p-6"
      >
        <div className="grid content-start gap-2">
          <p
            className="text-5xl font-semibold tracking-tight text-heading"
            data-testid="rating-average"
          >
            {summary.average === null ? '–' : summary.average.toFixed(1)}
          </p>
          <Stars value={summary.average ?? 0} size={18} />
          <p className="text-sm text-muted-foreground" data-testid="rating-count">
            {summary.count} {summary.count === 1 ? 'review' : 'reviews'}
          </p>
        </div>
        <ol className="grid content-start gap-2" aria-label="Rating distribution">
          {[5, 4, 3, 2, 1].map((n) => {
            const count = summary.distribution[n - 1]!;
            const percent = summary.count ? (count / summary.count) * 100 : 0;
            return (
              <li
                key={n}
                className="grid grid-cols-[1.5rem_minmax(0,1fr)_2rem] items-center gap-3 text-sm"
              >
                <span className="text-muted-foreground">{n}</span>
                <span
                  role="img"
                  aria-label={`${count} ${n}-star ${count === 1 ? 'review' : 'reviews'}`}
                  className="h-2 overflow-hidden rounded-full bg-muted"
                >
                  <span
                    className="block h-full rounded-full bg-amber-500"
                    style={{ width: `${percent}%` }}
                  />
                </span>
                <span className="text-right text-muted-foreground">{count}</span>
              </li>
            );
          })}
        </ol>
      </section>
      <section
        aria-labelledby="review-form-title"
        className="grid gap-3 rounded-xl border bg-card p-5 sm:p-6"
      >
        <h2 id="review-form-title" className="text-lg font-semibold text-heading">
          {mine ? 'Your review' : 'Rate this Harness'}
        </h2>
        {!user ? (
          <p className="text-sm text-muted-foreground">
            <Link
              className="font-medium text-brand hover:underline"
              to={'/login?returnTo=' + encodeURIComponent('/harnesses/' + id + '/reviews')}
            >
              Sign in
            </Link>{' '}
            to rate this Harness and share your experience.
          </p>
        ) : !canRate ? (
          <p className="text-sm text-muted-foreground">You cannot rate a Harness you own.</p>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="grid gap-4">
            <p className="text-sm text-muted-foreground">
              Reviews are public and show your display name.
            </p>
            <StarInput value={stars} onChange={setStars} disabled={busy} />
            <div className="grid gap-2">
              <label htmlFor="review-body" className="text-sm font-medium text-heading">
                Share details of your experience (optional)
              </label>
              <Textarea
                id="review-body"
                value={body}
                maxLength={2000}
                rows={4}
                disabled={busy}
                onChange={(event) => setBody(event.target.value)}
              />
              <p className="text-right text-xs text-muted-foreground">{body.length}/2000</p>
            </div>
            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy}>
                {mine ? 'Update review' : 'Post review'}
              </Button>
              {mine && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void remove()}
                >
                  Delete review
                </Button>
              )}
            </div>
          </form>
        )}
      </section>
      <section aria-labelledby="reviews-title">
        <h2 id="reviews-title" className="border-b pb-3 text-lg font-semibold text-heading">
          All reviews
        </h2>
        {items.length ? (
          <ul className="divide-y">
            {items.map((review) => (
              <ReviewItem key={review.id} review={review} mine={review.userId === user?.id} />
            ))}
          </ul>
        ) : (
          <p className="py-8 text-sm text-muted-foreground">
            No reviews yet. Be the first to share how this Harness worked for you.
          </p>
        )}
        {total > pageSize && (
          <div className="flex items-center justify-center gap-4 pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setParams({ page: String(page - 1) })}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {pages}
            </span>
            <Button
              type="button"
              variant="outline"
              disabled={page >= pages}
              onClick={() => setParams({ page: String(page + 1) })}
            >
              Next
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
