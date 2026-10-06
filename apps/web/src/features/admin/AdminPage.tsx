import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Activity,
  Database,
  FolderGit2,
  GitBranch,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type {
  AdminActivity,
  AdminHarness,
  AdminHealth,
  AdminOverview,
  AdminPage as Page,
  AdminUser,
  User,
} from '@skillshare/contracts';
import {
  Button,
  Empty,
  ErrorBox,
  Field,
  Loading,
  PageTitle,
  formatDate,
} from '../../components/ui';
import { useResource } from '../../lib/useResource';
import { api, errorMessage } from '../../lib/http';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { sessionChanged } from '../auth/authSlice';
import './admin.css';

const views = ['overview', 'users', 'harnesses', 'activity', 'monitoring'] as const;
type View = (typeof views)[number];
const labels: Record<View, string> = {
  overview: 'Overview',
  users: 'Users',
  harnesses: 'Harnesses',
  activity: 'Activity log',
  monitoring: 'Monitoring',
};
const number = (value: number) => value.toLocaleString();
function useAdminResource<T>(url: string) {
  const resource = useResource<T>(url);
  const dispatch = useAppDispatch();
  useEffect(() => {
    if (resource.status === 403) {
      void api
        .get<{ user: User }>('/auth/me')
        .then(({ data }) => dispatch(sessionChanged(data.user)))
        .catch(() => undefined);
    }
  }, [resource.status, dispatch]);
  return resource;
}
function Resource({
  resource,
  children,
}: {
  resource: { loading: boolean; error: string; reload: () => void };
  children: ReactNode;
}) {
  if (resource.loading) return <Loading />;
  if (resource.error) return <ErrorBox message={resource.error} retry={resource.reload} />;
  return children;
}
function Metric({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: number | string;
  note: string;
  icon: ReactNode;
}) {
  return (
    <div className="admin-metric">
      <div>
        <span>{label}</span>
        {icon}
      </div>
      <strong>{typeof value === 'number' ? number(value) : value}</strong>
      <small>{note}</small>
    </div>
  );
}
function Events({ items }: { items: AdminActivity[] }) {
  return items.length ? (
    <ol className="admin-events">
      {items.map((event) => (
        <li key={event.id}>
          <span className={`admin-event-icon ${event.group === 'access' ? 'access' : ''}`}>
            <Activity size={17} />
          </span>
          <div>
            <strong>{event.action.replaceAll('.', ' · ').replaceAll('_', ' ')}</strong>
            <p>
              {event.summary}
              {event.targetName && <> · {event.targetName}</>}
            </p>
            <small>
              {event.actorId ? (
                <Link to={`/users/${event.actorId}`}>{event.actorName ?? 'Account'}</Link>
              ) : (
                'System'
              )}{' '}
              · <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time>
            </small>
          </div>
        </li>
      ))}
    </ol>
  ) : (
    <Empty
      title="No activity in this period"
      description="Try a longer time range or another event group."
    />
  );
}
function Pagination({ data, onPage }: { data: Page<unknown>; onPage: (page: number) => void }) {
  return (
    <div className="admin-pagination">
      <span>
        {number(data.total)} results · Page {data.page} of{' '}
        {Math.max(1, Math.ceil(data.total / data.pageSize))}
      </span>
      <div>
        <Button variant="secondary" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>
          Previous
        </Button>
        <Button
          variant="secondary"
          disabled={data.page * data.pageSize >= data.total}
          onClick={() => onPage(data.page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
function Overview({ query }: { query: string }) {
  const resource = useAdminResource<AdminOverview>(`/admin/overview?${query}`);
  const data = resource.data;
  const max = Math.max(
    1,
    ...(data?.trend.flatMap((day) => [day.users, day.releases, day.revisions]) ?? []),
  );
  return (
    <Resource resource={resource}>
      {data && (
        <>
          <div className="admin-metrics">
            <Metric
              label="Accounts"
              value={data.totals.users}
              note={`${data.totals.admins} admins · ${data.totals.verified} email verified`}
              icon={<Users size={18} />}
            />
            <Metric
              label="Harnesses"
              value={data.totals.harnesses}
              note={`${data.totals.public} public · ${data.totals.private} private · ${data.totals.team} team`}
              icon={<FolderGit2 size={18} />}
            />
            <Metric
              label="Published releases"
              value={data.totals.releases}
              note={`${data.period.releases} in the selected period`}
              icon={<GitBranch size={18} />}
            />
            <Metric
              label="Active sessions"
              value={data.totals.sessions}
              note={`${data.totals.cliSessions} CLI sessions · unexpired, not revoked`}
              icon={<ShieldCheck size={18} />}
            />
          </div>
          <section className="admin-panel">
            <div className="admin-section-heading">
              <div>
                <h2>Platform contributions</h2>
                <p>
                  Daily registrations, releases, and file revisions · last {data.period.days}{' '}
                  calendar days
                </p>
              </div>
              <span className="admin-period-total">
                {number(data.period.users)} new accounts · {number(data.period.revisions)} revisions
              </span>
            </div>
            <div className="admin-chart-legend">
              <span className="users">Accounts</span>
              <span className="releases">Releases</span>
              <span className="revisions">Revisions</span>
            </div>
            <div className="admin-chart" aria-hidden="true">
              {data.trend.map((day) => (
                <div
                  className="admin-chart-day"
                  key={day.date}
                  title={`${day.date}: ${day.users} accounts, ${day.releases} releases, ${day.revisions} revisions`}
                >
                  {(['users', 'releases', 'revisions'] as const).map((kind) => (
                    <span
                      key={kind}
                      className={kind}
                      style={{ height: `${(day[kind] / max) * 100}%` }}
                    />
                  ))}
                </div>
              ))}
            </div>
            <div className="admin-chart-dates">
              <span>{data.trend[0]?.date}</span>
              <span>{data.trend.at(-1)?.date}</span>
            </div>
            <details className="admin-daily-data">
              <summary>View daily totals</summary>
              <div className="admin-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Accounts</th>
                      <th>Releases</th>
                      <th>Revisions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.trend.map((day) => (
                      <tr key={day.date}>
                        <th scope="row">{day.date}</th>
                        <td>{day.users}</td>
                        <td>{day.releases}</td>
                        <td>{day.revisions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
          <section className="admin-panel">
            <div className="admin-section-heading">
              <div>
                <h2>Recent activity</h2>
                <p>Changes across the platform</p>
              </div>
              <Link to="/admin?view=activity">View activity log →</Link>
            </div>
            <Events items={data.recent} />
          </section>
        </>
      )}
    </Resource>
  );
}
function RoleDialog({
  user,
  close,
  saved,
}: {
  user: AdminUser;
  close: () => void;
  saved: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const role = user.role === 'admin' ? 'user' : 'admin';
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  async function submit() {
    setBusy(true);
    setError('');
    try {
      await api.patch(`/admin/users/${user.id}/role`, { role, revision: user.revision });
      saved();
      close();
    } catch (err) {
      setError(errorMessage(err));
      saved();
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={ref}
      className="admin-role-dialog"
      aria-labelledby="role-title"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else close();
      }}
    >
      <ShieldCheck size={26} />
      <h2 id="role-title">
        {role === 'admin' ? 'Grant administrator access?' : 'Remove administrator access?'}
      </h2>
      <p>
        <strong>{user.name}</strong> · {user.email}
      </p>
      <p>
        {role === 'admin'
          ? 'This account will be able to see platform activity, account emails, Harness metadata, and grant roles to other verified users.'
          : 'This account will retain its workspace and lose access to platform administration immediately.'}
      </p>
      {error && (
        <ErrorBox
          message={error + ' Close this dialog and review the refreshed user list before retrying.'}
        />
      )}
      <div className="admin-dialog-actions">
        <Button variant="secondary" disabled={busy} onClick={close}>
          Cancel
        </Button>
        <Button disabled={busy || !!error} onClick={() => void submit()}>
          {busy ? 'Saving…' : `Change to ${role}`}
        </Button>
      </div>
    </dialog>
  );
}
function UsersView({ query, onPage }: { query: string; onPage: (page: number) => void }) {
  const resource = useAdminResource<Page<AdminUser>>(`/admin/users?${query}`);
  const currentUser = useAppSelector((state) => state.auth.user);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  return (
    <>
      <Resource resource={resource}>
        {resource.data && (
          <section className="admin-panel">
            <div className="admin-section-heading">
              <div>
                <h2>Account access</h2>
                <p>
                  New accounts receive the user role. Email verification is required for promotion.
                </p>
              </div>
            </div>
            <div className="admin-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Role</th>
                    <th>Email</th>
                    <th>Harnesses</th>
                    <th>Sessions</th>
                    <th>Joined</th>
                    <th>Access</th>
                  </tr>
                </thead>
                <tbody>
                  {resource.data.items.map((user) => (
                    <tr key={user.id}>
                      <th scope="row">
                        <Link to={`/users/${user.id}`}>{user.name}</Link>
                        <small>{user.email}</small>
                      </th>
                      <td>
                        <span className={`admin-role ${user.role}`}>{user.role}</span>
                      </td>
                      <td>{user.verified ? 'Verified' : 'Unverified'}</td>
                      <td>{user.harnessCount}</td>
                      <td>{user.activeSessions}</td>
                      <td>{formatDate(user.createdAt)}</td>
                      <td>
                        <Button
                          variant="secondary"
                          disabled={
                            user.id === currentUser?.id || (!user.verified && user.role === 'user')
                          }
                          onClick={() => setSelected(user)}
                        >
                          {user.role === 'admin' ? 'Make user' : 'Make admin'}
                        </Button>
                        {user.id === currentUser?.id ? (
                          <small>Your account · another admin must change it</small>
                        ) : (
                          !user.verified && <small>Verify email first</small>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!resource.data.items.length && (
              <Empty title="No matching accounts" description="Change the search or role filter." />
            )}
            <Pagination data={resource.data} onPage={onPage} />
          </section>
        )}
      </Resource>
      {selected && (
        <RoleDialog user={selected} close={() => setSelected(null)} saved={resource.reload} />
      )}
    </>
  );
}
function HarnessesView({ query, onPage }: { query: string; onPage: (page: number) => void }) {
  const resource = useAdminResource<Page<AdminHarness>>(`/admin/harnesses?${query}`);
  return (
    <Resource resource={resource}>
      {resource.data && (
        <section className="admin-panel">
          <div className="admin-section-heading">
            <div>
              <h2>Harness inventory</h2>
              <p>Ownership, visibility, and release metadata across all workspaces.</p>
            </div>
          </div>
          <div className="admin-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Harness</th>
                  <th>Owner</th>
                  <th>Visibility</th>
                  <th>Release</th>
                  <th>Files</th>
                  <th>Created</th>
                  <th>Published page</th>
                </tr>
              </thead>
              <tbody>
                {resource.data.items.map((harness) => (
                  <tr key={harness.id}>
                    <th scope="row">
                      {harness.name}
                      <small>
                        Revision {harness.revision} · {harness.releaseCount} releases
                      </small>
                    </th>
                    <td>
                      <Link to={`/users/${harness.ownerId}`}>{harness.ownerName}</Link>
                    </td>
                    <td>{harness.visibility}</td>
                    <td>{harness.version ? `v${harness.version}` : 'Unpublished'}</td>
                    <td>{harness.fileCount}</td>
                    <td>{formatDate(harness.createdAt)}</td>
                    <td>
                      {harness.visibility === 'public' && harness.releaseId ? (
                        <Link to={`/harnesses/${harness.id}/edit?release=${harness.releaseId}`}>
                          Open →
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!resource.data.items.length && (
            <Empty
              title="No matching Harnesses"
              description="Change the search or visibility filter."
            />
          )}
          <Pagination data={resource.data} onPage={onPage} />
        </section>
      )}
    </Resource>
  );
}
function ActivityView({ query, onPage }: { query: string; onPage: (page: number) => void }) {
  const resource = useAdminResource<Page<AdminActivity>>(`/admin/activity?${query}`);
  return (
    <Resource resource={resource}>
      {resource.data && (
        <section className="admin-panel">
          <div className="admin-section-heading">
            <div>
              <h2>Platform activity log</h2>
              <p>
                Account, publishing, editing, and access events. Access logging starts with the
                admin feature rollout.
              </p>
            </div>
          </div>
          <Events items={resource.data.items} />
          <Pagination data={resource.data} onPage={onPage} />
        </section>
      )}
    </Resource>
  );
}
function Monitoring() {
  const resource = useAdminResource<AdminHealth>('/admin/health');
  const data = resource.data;
  return (
    <Resource resource={resource}>
      {data && (
        <>
          <div className="admin-metrics">
            <Metric
              label="Database"
              value={data.database.status === 'healthy' ? 'Healthy' : 'Unavailable'}
              note={
                data.database.latencyMs === null
                  ? 'Database check failed'
                  : `SELECT 1 · ${data.database.latencyMs} ms`
              }
              icon={<Database size={18} />}
            />
            <Metric
              label="API uptime"
              value={`${Math.floor(data.api.uptimeSeconds / 3600)}h ${Math.floor((data.api.uptimeSeconds % 3600) / 60)}m`}
              note={`Started ${new Date(data.api.startedAt).toLocaleString()}`}
              icon={<Activity size={18} />}
            />
            <Metric
              label="Completed requests"
              value={data.api.requests}
              note={`${data.api.rejected} rejected (4xx) · ${data.api.serverErrors} server errors (5xx)`}
              icon={<GitBranch size={18} />}
            />
            <Metric
              label="API memory"
              value={`${data.api.memoryMb} MB`}
              note="Resident memory for this API process"
              icon={<Database size={18} />}
            />
          </div>
          <section className="admin-panel">
            <div className="admin-section-heading">
              <div>
                <h2>Request performance</h2>
                <p>Measured responses from this API process</p>
              </div>
              <Button variant="secondary" onClick={resource.reload}>
                <RefreshCw size={15} /> Refresh health
              </Button>
            </div>
            <dl className="admin-health-list">
              <div>
                <dt>Mean response time</dt>
                <dd>{data.api.averageMs} ms</dd>
              </div>
              <div>
                <dt>95th percentile response time</dt>
                <dd>{data.api.p95Ms} ms</dd>
              </div>
              <div>
                <dt>Database checked</dt>
                <dd>
                  <time dateTime={data.checkedAt}>{new Date(data.checkedAt).toLocaleString()}</time>
                </dd>
              </div>
            </dl>
            <p className="admin-measurement-note">
              Request totals and mean latency reset when this API process restarts. The 95th
              percentile covers its latest 2,000 completed API responses. These checks cover the API
              and database; email, external connections, and other API instances are outside this
              view.
            </p>
          </section>
        </>
      )}
    </Resource>
  );
}
export function AdminPage() {
  const [params, setParams] = useSearchParams();
  const candidate = params.get('view') as View;
  const view = views.includes(candidate) ? candidate : 'overview';
  const days = ['7', '30', '90'].includes(params.get('days') ?? '') ? params.get('days')! : '30';
  const [refresh, setRefresh] = useState(0);
  const query = new URLSearchParams(params);
  query.delete('view');
  query.set('days', days);
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };
  return (
    <div className="admin-page">
      <PageTitle
        eyebrow="PLATFORM ADMINISTRATION"
        title="Platform overview"
        description="Monitor your community, releases, and account access."
        action={
          <Button variant="secondary" onClick={() => setRefresh((n) => n + 1)}>
            <RefreshCw size={16} /> Refresh data
          </Button>
        }
      />
      <nav className="admin-tabs" aria-label="Administration sections">
        {views.map((item) => (
          <Link
            key={item}
            to={`/admin?view=${item}&days=${days}`}
            aria-current={view === item ? 'page' : undefined}
          >
            {labels[item]}
          </Link>
        ))}
      </nav>
      <div className="admin-toolbar">
        {(view === 'overview' || view === 'activity') && (
          <Field label="Time range">
            <select value={days} onChange={(e) => update('days', e.target.value)}>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
          </Field>
        )}
        {(view === 'users' || view === 'harnesses') && (
          <form
            key={`${view}-${params.get('q')}`}
            className="admin-search"
            onSubmit={(e) => {
              e.preventDefault();
              update('q', String(new FormData(e.currentTarget).get('q') ?? ''));
            }}
          >
            <Field label={view === 'users' ? 'Search name or email' : 'Search Harness or owner'}>
              <input name="q" defaultValue={params.get('q') ?? ''} maxLength={120} type="search" />
            </Field>
            <Button variant="secondary" type="submit">
              Search
            </Button>
          </form>
        )}
        {view === 'users' && (
          <Field label="Role">
            <select
              value={params.get('role') ?? 'all'}
              onChange={(e) => update('role', e.target.value)}
            >
              <option value="all">All roles</option>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
        )}
        {view === 'harnesses' && (
          <Field label="Visibility">
            <select
              value={params.get('visibility') ?? 'all'}
              onChange={(e) => update('visibility', e.target.value)}
            >
              {['all', 'public', 'private', 'team'].map((value) => (
                <option key={value} value={value}>
                  {value === 'all' ? 'All visibility' : value}
                </option>
              ))}
            </select>
          </Field>
        )}
        {view === 'activity' && (
          <Field label="Event group">
            <select
              value={params.get('group') ?? 'all'}
              onChange={(e) => update('group', e.target.value)}
            >
              {['all', 'accounts', 'harnesses', 'access'].map((value) => (
                <option key={value} value={value}>
                  {value === 'all' ? 'All events' : value}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <div key={`${view}-${refresh}`}>
        {view === 'overview' ? (
          <Overview query={query.toString()} />
        ) : view === 'users' ? (
          <UsersView query={query.toString()} onPage={(page) => update('page', String(page))} />
        ) : view === 'harnesses' ? (
          <HarnessesView query={query.toString()} onPage={(page) => update('page', String(page))} />
        ) : view === 'activity' ? (
          <ActivityView query={query.toString()} onPage={(page) => update('page', String(page))} />
        ) : (
          <Monitoring />
        )}
      </div>
    </div>
  );
}
