import { useEffect, useState, type ReactNode } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useResource } from '../../lib/useResource';
import { api, errorMessage } from '../../lib/http';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { sessionChanged } from '../auth/authSlice';

const views = ['overview', 'users', 'harnesses', 'activity', 'monitoring'] as const;
type View = (typeof views)[number];
const labels: Record<View, string> = {
  overview: 'Overview',
  users: 'Users',
  harnesses: 'Harnesses',
  activity: 'Activity log',
  monitoring: 'Monitoring',
};
const chartColors = { users: '#818cf8', releases: '#34d399', revisions: '#fbbf24' } as const;
const number = (value: number) => value.toLocaleString();
const linkClass = 'text-primary underline-offset-4 hover:underline';
const selectClass =
  'h-10 w-full min-w-40 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';
const panelClass = 'gap-0 py-0';
const headCell = 'h-11 px-5 font-semibold text-muted-foreground';
const bodyCell = 'px-5 py-3.5';
const subText = 'mt-1 block max-w-56 text-xs font-normal whitespace-normal text-muted-foreground';
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
function SectionHeading({
  title,
  description,
  aside,
}: {
  title: string;
  description?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-5 sm:px-6">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {aside}
    </div>
  );
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
    <Card className="gap-3 py-5" data-testid="admin-metric">
      <CardContent className="flex flex-col gap-3 px-5">
        <div className="flex items-center justify-between gap-3 text-sm font-medium text-muted-foreground">
          <span>{label}</span>
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-surface text-brand">
            {icon}
          </span>
        </div>
        <strong className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {typeof value === 'number' ? number(value) : value}
        </strong>
        <small className="text-xs leading-relaxed text-muted-foreground">{note}</small>
      </CardContent>
    </Card>
  );
}
function MetricGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}
function Events({ items }: { items: AdminActivity[] }) {
  return items.length ? (
    <ol className="px-4 pb-2 sm:px-6" data-testid="admin-events">
      {items.map((event) => (
        <li key={event.id} className="flex gap-3.5 border-t py-4">
          <span
            className={cn(
              'grid size-9 shrink-0 place-items-center rounded-full',
              event.group === 'access'
                ? 'bg-brand-surface text-brand'
                : 'bg-muted text-muted-foreground',
            )}
          >
            <Activity size={17} />
          </span>
          <div className="min-w-0">
            <strong className="text-sm font-semibold text-foreground capitalize">
              {event.action.replaceAll('.', ' · ').replaceAll('_', ' ')}
            </strong>
            <p className="my-1 text-sm break-words text-foreground">
              {event.summary}
              {event.targetName && <> · {event.targetName}</>}
            </p>
            <small className="text-xs text-muted-foreground">
              {event.actorId ? (
                <Link className={linkClass} to={`/users/${event.actorId}`}>
                  {event.actorName ?? 'Account'}
                </Link>
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
    <div className="px-4 pb-6 sm:px-6">
      <Empty
        title="No activity in this period"
        description="Try a longer time range or another event group."
      />
    </div>
  );
}
function Pagination({ data, onPage }: { data: Page<unknown>; onPage: (page: number) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-4 text-sm text-muted-foreground sm:px-6">
      <span>
        {number(data.total)} results · Page {data.page} of{' '}
        {Math.max(1, Math.ceil(data.total / data.pageSize))}
      </span>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          className="h-9"
          disabled={data.page <= 1}
          onClick={() => onPage(data.page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          className="h-9"
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
          <MetricGrid>
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
          </MetricGrid>
          <Card className={panelClass}>
            <SectionHeading
              title="Platform contributions"
              description={`Daily registrations, releases, and file revisions · last ${data.period.days} calendar days`}
              aside={
                <span className="text-sm text-muted-foreground">
                  {number(data.period.users)} new accounts · {number(data.period.revisions)}{' '}
                  revisions
                </span>
              }
            />
            <div className="flex flex-wrap gap-x-6 gap-y-2 px-4 pb-5 text-xs text-muted-foreground sm:px-6">
              {(
                [
                  ['users', 'Accounts'],
                  ['releases', 'Releases'],
                  ['revisions', 'Revisions'],
                ] as const
              ).map(([kind, text]) => (
                <span key={kind} className="inline-flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-2.5 rounded-sm"
                    style={{ backgroundColor: chartColors[kind] }}
                  />
                  {text}
                </span>
              ))}
            </div>
            <div
              className="mx-4 flex h-44 items-end gap-1 border-b bg-[repeating-linear-gradient(to_top,transparent,transparent_42px,var(--border)_43px)] sm:mx-6"
              aria-hidden="true"
            >
              {data.trend.map((day) => (
                <div
                  className="flex h-full flex-1 items-end gap-px"
                  data-testid="admin-chart-day"
                  key={day.date}
                  title={`${day.date}: ${day.users} accounts, ${day.releases} releases, ${day.revisions} revisions`}
                >
                  {(['users', 'releases', 'revisions'] as const).map((kind) => (
                    <span
                      key={kind}
                      className="min-w-px flex-1 rounded-t-sm"
                      style={{
                        height: `${(day[kind] / max) * 100}%`,
                        backgroundColor: chartColors[kind],
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
            <div className="flex justify-between px-4 py-3 text-xs text-muted-foreground sm:px-6">
              <span>{data.trend[0]?.date}</span>
              <span>{data.trend.at(-1)?.date}</span>
            </div>
            <details className="border-t" data-testid="admin-daily-data">
              <summary className="cursor-pointer px-4 py-4 text-sm font-medium text-primary select-none hover:underline sm:px-6">
                View daily totals
              </summary>
              <div className="max-h-72 overflow-auto border-t">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className={headCell}>Date</TableHead>
                      <TableHead className={headCell}>Accounts</TableHead>
                      <TableHead className={headCell}>Releases</TableHead>
                      <TableHead className={headCell}>Revisions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.trend.map((day) => (
                      <TableRow key={day.date}>
                        <TableHead scope="row" className={cn(bodyCell, 'h-auto')}>
                          {day.date}
                        </TableHead>
                        <TableCell className={bodyCell}>{day.users}</TableCell>
                        <TableCell className={bodyCell}>{day.releases}</TableCell>
                        <TableCell className={bodyCell}>{day.revisions}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </details>
          </Card>
          <Card className={cn(panelClass, 'pb-2')}>
            <SectionHeading
              title="Recent activity"
              description="Changes across the platform"
              aside={
                <Link
                  className={cn(linkClass, 'text-sm whitespace-nowrap')}
                  to="/admin?view=activity"
                >
                  View activity log →
                </Link>
              }
            />
            <Events items={data.recent} />
          </Card>
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
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const role = user.role === 'admin' ? 'user' : 'admin';
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
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
    >
      <DialogContent showCloseButton={false} className="gap-5 p-6 sm:max-w-lg">
        <DialogHeader className="gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-brand-surface text-brand">
            <ShieldCheck size={24} />
          </span>
          <DialogTitle className="text-xl leading-snug font-semibold">
            {role === 'admin' ? 'Grant administrator access?' : 'Remove administrator access?'}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed break-words">
            {role === 'admin'
              ? 'This account will be able to see platform activity, account emails, Harness metadata, and grant roles to other verified users.'
              : 'This account will retain its workspace and lose access to platform administration immediately.'}
          </DialogDescription>
        </DialogHeader>
        <p className="rounded-lg bg-muted px-3 py-2.5 text-sm break-words text-foreground">
          <strong className="font-semibold">{user.name}</strong>{' '}
          <span className="text-muted-foreground">· {user.email}</span>
        </p>
        {error && (
          <ErrorBox
            message={
              error + ' Close this dialog and review the refreshed user list before retrying.'
            }
          />
        )}
        <DialogFooter className="-mx-6 -mb-6 px-6 py-4">
          <Button variant="secondary" disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button disabled={busy || !!error} onClick={() => void submit()}>
            {busy ? 'Saving…' : `Change to ${role}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
          <Card className={panelClass}>
            <SectionHeading
              title="Account access"
              description="New accounts receive the user role. Email verification is required for promotion."
            />
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className={headCell}>Account</TableHead>
                  <TableHead className={headCell}>Role</TableHead>
                  <TableHead className={headCell}>Email</TableHead>
                  <TableHead className={headCell}>Harnesses</TableHead>
                  <TableHead className={headCell}>Sessions</TableHead>
                  <TableHead className={headCell}>Joined</TableHead>
                  <TableHead className={headCell}>Access</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resource.data.items.map((user) => (
                  <TableRow key={user.id}>
                    <TableHead scope="row" className={cn(bodyCell, 'h-auto')}>
                      <Link className={linkClass} to={`/users/${user.id}`}>
                        {user.name}
                      </Link>
                      <span className={subText}>{user.email}</span>
                    </TableHead>
                    <TableCell className={bodyCell}>
                      <Badge
                        variant="outline"
                        className={cn(
                          'h-6 rounded-md px-2.5 capitalize',
                          user.role === 'admin' &&
                            'border-brand-border bg-brand-surface text-brand',
                        )}
                      >
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell className={bodyCell}>
                      {user.verified ? 'Verified' : 'Unverified'}
                    </TableCell>
                    <TableCell className={bodyCell}>{user.harnessCount}</TableCell>
                    <TableCell className={bodyCell}>{user.activeSessions}</TableCell>
                    <TableCell className={bodyCell}>{formatDate(user.createdAt)}</TableCell>
                    <TableCell className={bodyCell}>
                      <div className="flex flex-col items-start">
                        <Button
                          variant="secondary"
                          className="h-9"
                          disabled={
                            user.id === currentUser?.id || (!user.verified && user.role === 'user')
                          }
                          onClick={() => setSelected(user)}
                        >
                          {user.role === 'admin' ? 'Make user' : 'Make admin'}
                        </Button>
                        {user.id === currentUser?.id ? (
                          <span className={subText}>
                            Your account · another admin must change it
                          </span>
                        ) : (
                          !user.verified && <span className={subText}>Verify email first</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!resource.data.items.length && (
              <div className="p-6">
                <Empty
                  title="No matching accounts"
                  description="Change the search or role filter."
                />
              </div>
            )}
            <Pagination data={resource.data} onPage={onPage} />
          </Card>
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
        <Card className={panelClass}>
          <SectionHeading
            title="Harness inventory"
            description="Ownership, visibility, and release metadata across all workspaces."
          />
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className={headCell}>Harness</TableHead>
                <TableHead className={headCell}>Owner</TableHead>
                <TableHead className={headCell}>Visibility</TableHead>
                <TableHead className={headCell}>Release</TableHead>
                <TableHead className={headCell}>Files</TableHead>
                <TableHead className={headCell}>Created</TableHead>
                <TableHead className={headCell}>Published page</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resource.data.items.map((harness) => (
                <TableRow key={harness.id}>
                  <TableHead scope="row" className={cn(bodyCell, 'h-auto')}>
                    {harness.name}
                    <span className={subText}>
                      Revision {harness.revision} · {harness.releaseCount} releases
                    </span>
                  </TableHead>
                  <TableCell className={bodyCell}>
                    <Link className={linkClass} to={`/users/${harness.ownerId}`}>
                      {harness.ownerName}
                    </Link>
                  </TableCell>
                  <TableCell className={cn(bodyCell, 'capitalize')}>{harness.visibility}</TableCell>
                  <TableCell className={bodyCell}>
                    {harness.version ? `v${harness.version}` : 'Unpublished'}
                  </TableCell>
                  <TableCell className={bodyCell}>{harness.fileCount}</TableCell>
                  <TableCell className={bodyCell}>{formatDate(harness.createdAt)}</TableCell>
                  <TableCell className={bodyCell}>
                    {harness.visibility === 'public' && harness.releaseId ? (
                      <Link
                        className={linkClass}
                        to={`/harnesses/${harness.id}/edit?release=${harness.releaseId}`}
                      >
                        Open →
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!resource.data.items.length && (
            <div className="p-6">
              <Empty
                title="No matching Harnesses"
                description="Change the search or visibility filter."
              />
            </div>
          )}
          <Pagination data={resource.data} onPage={onPage} />
        </Card>
      )}
    </Resource>
  );
}
function ActivityView({ query, onPage }: { query: string; onPage: (page: number) => void }) {
  const resource = useAdminResource<Page<AdminActivity>>(`/admin/activity?${query}`);
  return (
    <Resource resource={resource}>
      {resource.data && (
        <Card className={panelClass}>
          <SectionHeading
            title="Platform activity log"
            description="Account, publishing, editing, and access events. Access logging starts with the admin feature rollout."
          />
          <Events items={resource.data.items} />
          <Pagination data={resource.data} onPage={onPage} />
        </Card>
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
          <MetricGrid>
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
          </MetricGrid>
          <Card className={panelClass}>
            <SectionHeading
              title="Request performance"
              description="Measured responses from this API process"
              aside={
                <Button variant="secondary" onClick={resource.reload}>
                  <RefreshCw size={15} /> Refresh health
                </Button>
              }
            />
            <dl className="px-4 sm:px-6">
              {[
                ['Mean response time', `${data.api.averageMs} ms`],
                ['95th percentile response time', `${data.api.p95Ms} ms`],
                [
                  'Database checked',
                  <time key="checked" dateTime={data.checkedAt}>
                    {new Date(data.checkedAt).toLocaleString()}
                  </time>,
                ],
              ].map(([term, value]) => (
                <div
                  key={String(term)}
                  className="flex flex-col gap-1 border-t py-4 text-sm sm:flex-row sm:justify-between sm:gap-3"
                >
                  <dt className="text-muted-foreground">{term}</dt>
                  <dd className="font-semibold text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mx-4 mt-3 mb-6 rounded-lg bg-muted p-4 text-sm leading-relaxed text-muted-foreground sm:mx-6">
              Request totals and mean latency reset when this API process restarts. The 95th
              percentile covers its latest 2,000 completed API responses. These checks cover the API
              and database; email, external connections, and other API instances are outside this
              view.
            </p>
          </Card>
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
    <div className="mx-auto w-full max-w-[1500px] min-w-0" data-testid="admin-page">
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
      <nav
        className="mb-6 flex gap-6 overflow-x-auto border-b sm:gap-8"
        aria-label="Administration sections"
      >
        {views.map((item) => (
          <Link
            key={item}
            to={`/admin?view=${item}&days=${days}`}
            aria-current={view === item ? 'page' : undefined}
            className="-mb-px border-b-2 border-transparent py-3.5 text-sm font-semibold whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:text-primary"
          >
            {labels[item]}
          </Link>
        ))}
      </nav>
      <div className="mb-6 flex flex-wrap items-end gap-4 [&>div]:mb-0">
        {(view === 'overview' || view === 'activity') && (
          <Field label="Time range">
            <select
              className={selectClass}
              value={days}
              onChange={(e) => update('days', e.target.value)}
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
          </Field>
        )}
        {(view === 'users' || view === 'harnesses') && (
          <form
            key={`${view}-${params.get('q')}`}
            className="flex min-w-0 basis-full items-end gap-2 sm:flex-1 sm:basis-80 [&>div]:mb-0 [&>div]:flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              update('q', String(new FormData(e.currentTarget).get('q') ?? ''));
            }}
          >
            <Field label={view === 'users' ? 'Search name or email' : 'Search Harness or owner'}>
              <Input
                className="h-10"
                name="q"
                defaultValue={params.get('q') ?? ''}
                maxLength={120}
                type="search"
              />
            </Field>
            <Button variant="secondary" type="submit">
              Search
            </Button>
          </form>
        )}
        {view === 'users' && (
          <Field label="Role">
            <select
              className={selectClass}
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
              className={cn(selectClass, 'capitalize')}
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
              className={cn(selectClass, 'capitalize')}
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
      <div className="flex flex-col gap-6" key={`${view}-${refresh}`}>
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
