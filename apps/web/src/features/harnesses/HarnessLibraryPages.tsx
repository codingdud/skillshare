import { Link, useSearchParams } from 'react-router-dom';
import { Clock, ArrowUpRight } from 'lucide-react';
import type { HarnessDiscoveryPage } from '@skillshare/contracts';
import { useResource } from '../../lib/useResource';
import { HarnessResult } from './HarnessResult';
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
          <div className="asset-list">
            {resource.data.items.map((item) => (
              <HarnessResult key={item.id} item={item} onChange={resource.reload} />
            ))}
          </div>
          {resource.data.total > resource.data.pageSize && (
            <div className="pagination">
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
            <Link to="/" className="btn btn-primary">
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
        <div className="panel">
          {resource.data.items.map((item) => (
            <Link
              key={item.id}
              className="activity-row"
              to={'/harnesses/' + item.harnessId + '/edit?release=' + item.id}
            >
              <div className="icon-tile">
                <Clock size={18} />
              </div>
              <div>
                <strong>
                  {item.harnessName} · v{item.version}
                </strong>
                <p>{item.notes}</p>
                <p className="text-sm text-slate-500">{formatDate(item.createdAt)}</p>
              </div>
              <ArrowUpRight size={16} />
            </Link>
          ))}
        </div>
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
      <div className="panel content-panel max-w-3xl">
        <h2>Start with a team Harness</h2>
        <p>
          Create a Harness with Team visibility, then select Share with teammate in its editor.
          Invited users can view published releases; owners edit drafts and publish.
        </p>
        <Link className="btn btn-primary mt-4" to="/harnesses/new">
          Create a team Harness
        </Link>
      </div>
    </>
  );
}
