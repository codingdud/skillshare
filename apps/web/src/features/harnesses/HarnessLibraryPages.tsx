import { Link, useSearchParams } from 'react-router-dom';
import { Clock, ArrowUpRight } from 'lucide-react';
import type { HarnessDiscoveryPage } from '@skillshare/contracts';
import { useResource } from '../../lib/useResource';
import { HarnessResult } from './HarnessResult';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PageTitle, Loading, ErrorBox, Empty, Button, formatDate } from '../../components/ui';
export function SavedPage() {
  const [params, setParams] = useSearchParams();
  const resource = useResource<HarnessDiscoveryPage>(
    '/harnesses/saved?page=' + (params.get('page') ?? '1'),
  );
  return (
    <>
      <PageTitle
        eyebrow="YOUR REFERENCE SHELF"
        title="Saved Harnesses"
        description="Published native repositories you've saved."
      />
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ErrorBox message={resource.error} retry={resource.reload} />
      ) : resource.data?.items.length ? (
        <>
          <div className="flex flex-col gap-3">
            {resource.data.items.map((item) => (
              <HarnessResult key={item.id} item={item} onChange={resource.reload} />
            ))}
          </div>
          {resource.data.total > resource.data.pageSize && (
            <div className="mt-6 flex items-center justify-center gap-5 text-sm text-muted-foreground">
              <Button
                variant="secondary"
                disabled={resource.data.page <= 1}
                onClick={() => setParams({ page: String(resource.data!.page - 1) })}
              >
                Previous
              </Button>
              <span>Page {resource.data.page}</span>
              <Button
                variant="secondary"
                disabled={resource.data.page * resource.data.pageSize >= resource.data.total}
                onClick={() => setParams({ page: String(resource.data!.page + 1) })}
              >
                Next
              </Button>
            </div>
          )}
        </>
      ) : (
        <Empty
          title="Keep useful Harnesses close"
          description="Save a Harness from Explore to find it here."
          action={
            <Link to="/" className={buttonVariants({ size: 'lg' })}>
              Explore Harnesses
            </Link>
          }
        />
      )}
    </>
  );
}
export function ActivityPage() {
  const resource = useResource<{
    items: {
      id: string;
      harnessId: string;
      harnessName: string;
      version: string;
      notes: string;
      createdAt: string;
    }[];
  }>('/harnesses/activity');
  return (
    <>
      <PageTitle
        eyebrow="STAY IN THE LOOP"
        title="Harness activity"
        description="Published releases from Harnesses you own or share."
      />
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ErrorBox message={resource.error} retry={resource.reload} />
      ) : resource.data?.items.length ? (
        <Card className="gap-0 divide-y py-0">
          {resource.data.items.map((item) => (
            <Link
              key={item.id}
              className="flex items-center gap-4 p-6 hover:bg-muted/50"
              to={'/harnesses/' + item.harnessId + '/edit?release=' + item.id}
            >
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-surface text-brand">
                <Clock size={18} />
              </div>
              <div>
                <strong className="text-sm text-foreground">
                  {item.harnessName} · v{item.version}
                </strong>
                <p className="text-sm text-text-strong">{item.notes}</p>
                <p className="text-sm text-muted-foreground">{formatDate(item.createdAt)}</p>
              </div>
              <ArrowUpRight size={16} className="ml-auto text-text-faint" />
            </Link>
          ))}
        </Card>
      ) : (
        <Empty
          title="No releases yet"
          description="Publish a Harness release to start its history."
        />
      )}
    </>
  );
}
export function OrganizationsPage() {
  return (
    <>
      <PageTitle
        eyebrow="WORK BETTER TOGETHER"
        title="Shared Harness access"
        description="Share a native file repository with your team."
      />
      <Card className="max-w-3xl p-7">
        <h2 className="text-xl font-semibold text-foreground">Start with a team Harness</h2>
        <p className="leading-relaxed text-text-strong">
          Create a Harness with Team visibility, then select Share with teammate in its editor.
          Invited users can view published releases; owners edit drafts and publish.
        </p>
        <Link className={cn(buttonVariants({ size: 'lg' }), 'mt-2 w-fit')} to="/harnesses/new">
          Create a team Harness
        </Link>
      </Card>
    </>
  );
}
