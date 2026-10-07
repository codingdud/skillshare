import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  Copy,
  FileCode2,
  GitBranch,
  Globe,
  Layers,
  MapPin,
  Pencil,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import {
  profileUpdateSchema,
  type OwnUserProfile,
  type UserProfile,
  type ProfileUpdate,
} from '@skillshare/contracts';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { notify } from '../../app/store';
import { sessionChanged } from '../auth/authSlice';
import { api, errorMessage } from '../../lib/http';
import { useResource } from '../../lib/useResource';
import {
  Button,
  Empty,
  ErrorBox,
  Field,
  Loading,
  PageTitle,
  TypeBadge,
  formatDate,
} from '../../components/ui';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const actionLink = 'h-10 w-full gap-2 px-4 font-semibold';
const accountLink =
  'flex min-h-11 items-center gap-2 border-t border-border py-3 text-sm text-foreground/80 hover:text-primary';
const textLink = 'flex min-w-0 items-center gap-2 break-words hover:text-primary hover:underline';
const cardPadding = '[--card-spacing:--spacing(6)]';
const invalidHint = '[&_p]:text-destructive';

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function ProfileAvatar({ name }: { name: string }) {
  return (
    <Avatar aria-hidden="true" className="mb-5 size-20! rounded-3xl after:rounded-3xl">
      <AvatarFallback className="rounded-3xl bg-brand-surface! text-2xl! font-semibold text-brand!">
        {name}
      </AvatarFallback>
    </Avatar>
  );
}

export function ProfilePage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const user = useAppSelector((state) => state.auth.user);
  const dispatch = useAppDispatch();
  const resource = useResource<UserProfile | OwnUserProfile>(
    '/users/' + (id ?? 'me') + '?page=' + encodeURIComponent(params.get('page') ?? '1'),
  );
  if (resource.loading) return <Loading />;
  if (resource.error) return <ErrorBox message={resource.error} retry={resource.reload} />;
  if (!resource.data) return null;
  const profile = resource.data;
  const own = profile.id === user?.id;
  const account = 'account' in profile ? profile.account : null;
  const stats = [
    ['Public Harnesses', profile.stats.harnesses],
    ['Published releases', profile.stats.releases],
    ['Native files', profile.stats.files],
  ];
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.origin + '/users/' + profile.id);
      dispatch(notify('Public profile link copied.'));
    } catch {
      dispatch(notify('Could not copy the link. Open your public profile and copy its address.'));
    }
  }
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageTitle
        eyebrow="THE PEOPLE BEHIND THE FILES"
        title={own ? 'Your profile' : 'Creator profile'}
        description="Native AI files, shared with the people who build them."
        action={
          <Button variant="secondary" onClick={() => void copyLink()}>
            <Copy size={16} /> Share profile
          </Button>
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[18.5rem_minmax(0,1fr)] lg:gap-8">
        <aside className="grid min-w-0 gap-6">
          <Card className={cardPadding} data-testid="profile-identity">
            <CardContent className="flex flex-col">
              <ProfileAvatar name={initials(profile.name)} />
              <h2 className="text-xl font-semibold tracking-tight break-words text-foreground">
                {profile.name}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">Harness creator</p>
              {profile.bio ? (
                <p
                  className="mt-4 break-words whitespace-pre-wrap text-foreground/80"
                  data-testid="profile-bio"
                >
                  {profile.bio}
                </p>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  {own
                    ? 'Tell people what you build and how you work.'
                    : 'This creator has not added a bio yet.'}
                </p>
              )}
              <Separator className="my-5" />
              <ul className="grid gap-3 text-sm text-muted-foreground">
                {profile.company && (
                  <li className="flex min-w-0 items-center gap-2.5 break-words">
                    <Building2 size={16} className="shrink-0" />
                    <span>{profile.company}</span>
                  </li>
                )}
                {profile.location && (
                  <li className="flex min-w-0 items-center gap-2.5 break-words">
                    <MapPin size={16} className="shrink-0" />
                    <span>{profile.location}</span>
                  </li>
                )}
                {profile.website && (
                  <li className="flex min-w-0 items-center gap-2.5">
                    <Globe size={16} className="shrink-0" />
                    <a
                      className={textLink}
                      href={profile.website}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {profile.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                      <ArrowUpRight size={13} className="shrink-0" />
                    </a>
                  </li>
                )}
                {profile.github && (
                  <li className="flex min-w-0 items-center gap-2.5">
                    <GitBranch size={16} className="shrink-0" />
                    <a
                      className={textLink}
                      href={'https://github.com/' + profile.github}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {profile.github}
                      <ArrowUpRight size={13} className="shrink-0" />
                    </a>
                  </li>
                )}
                <li className="flex min-w-0 items-center gap-2.5">
                  <CalendarDays size={16} className="shrink-0" />
                  <span>Joined {formatDate(profile.createdAt)}</span>
                </li>
              </ul>
              {own && (
                <div className="mt-6 grid gap-1">
                  <Link
                    to="/profile/edit"
                    className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), actionLink)}
                  >
                    <Pencil size={15} /> Edit profile
                  </Link>
                  <Link
                    className="flex min-h-8 items-center justify-center gap-1.5 rounded-lg text-xs text-muted-foreground hover:text-primary hover:underline"
                    to={'/users/' + profile.id}
                  >
                    View public profile <ArrowUpRight size={14} />
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
          {own && (
            <Card className={cardPadding}>
              <CardContent className="flex flex-col">
                <h3 className="mb-4 flex items-center gap-2 font-semibold text-foreground">
                  <ShieldCheck size={17} className="text-brand" /> Your account
                </h3>
                {account && (
                  <>
                    <p
                      className="mb-2 text-sm break-all text-foreground"
                      data-testid="profile-email"
                    >
                      {account.email}
                    </p>
                    <p className="mb-3 flex items-center gap-1.5 text-xs text-success">
                      <CheckCircle2 size={14} />
                      {account.verified ? 'Email verified' : 'Verification required'}
                    </p>
                  </>
                )}
                <p className="text-sm text-muted-foreground">
                  Account details are visible only to you.
                </p>
                <div className="mt-4 flex flex-col">
                  <Link to="/devices" className={accountLink}>
                    <Terminal size={16} /> Connected CLI devices
                    <ArrowUpRight size={14} className="ml-auto" />
                  </Link>
                  <Link to="/harnesses" className={accountLink}>
                    <Layers size={16} /> My Harnesses
                    <ArrowUpRight size={14} className="ml-auto" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}
        </aside>
        <div className="grid min-w-0 gap-8">
          <dl
            className="m-0 grid grid-cols-3 gap-2 sm:gap-4"
            aria-label="Public contribution statistics"
          >
            {stats.map(([label, value]) => (
              <Card
                key={label}
                className="[--card-spacing:--spacing(4)] sm:[--card-spacing:--spacing(5)]"
              >
                <CardContent className="flex flex-col-reverse px-3 sm:px-5">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="m-0 mb-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                    {value}
                  </dd>
                </CardContent>
              </Card>
            ))}
          </dl>
          <section aria-labelledby="profile-harnesses-title">
            <div className="mb-5 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 id="profile-harnesses-title" className="text-xl font-semibold text-foreground">
                  Public Harnesses
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Latest published releases, with their original file structure.
                </p>
              </div>
              {own && (
                <Link
                  to="/harnesses"
                  className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  Manage Harnesses <ArrowUpRight size={15} />
                </Link>
              )}
            </div>
            {profile.harnesses.items.length ? (
              <div className="grid gap-4">
                {profile.harnesses.items.map((harness) => (
                  <Card
                    key={harness.id}
                    className={cn('min-w-0 transition-shadow hover:ring-primary/30', cardPadding)}
                  >
                    <CardContent className="flex flex-col">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <TypeBadge type="harness" />
                        <Badge variant="outline" className="h-6 font-normal text-muted-foreground">
                          v{harness.version}
                        </Badge>
                        <Badge variant="outline" className="h-6 font-normal text-muted-foreground">
                          Public
                        </Badge>
                      </div>
                      <Link
                        className="flex items-center justify-between gap-3 text-lg font-semibold break-words text-foreground hover:text-primary"
                        to={'/harnesses/' + harness.id + '/edit?release=' + harness.releaseId}
                      >
                        {harness.name}
                        <ArrowUpRight size={17} className="shrink-0 text-muted-foreground" />
                      </Link>
                      <p className="mt-2 break-words text-muted-foreground">
                        {harness.description}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <FileCode2 size={14} /> {harness.fileCount} native files
                        </span>
                        <span>Published {formatDate(harness.updatedAt)}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Empty
                title={own ? 'Your public work starts here' : 'No public Harnesses yet'}
                description={
                  own
                    ? 'Publish a Harness with Public visibility to share it on your profile. Your private and team work stays in My Harnesses.'
                    : 'Published public Harnesses will appear here when this creator shares them.'
                }
                action={
                  own ? (
                    <Link
                      className={cn(buttonVariants({ size: 'lg' }), actionLink, 'w-auto')}
                      to="/harnesses/new"
                    >
                      Create a Harness
                    </Link>
                  ) : (
                    <Link
                      className={cn(
                        buttonVariants({ variant: 'outline', size: 'lg' }),
                        actionLink,
                        'w-auto',
                      )}
                      to="/"
                    >
                      Explore Harnesses
                    </Link>
                  )
                }
              />
            )}
            {profile.harnesses.total > profile.harnesses.pageSize && (
              <div className="mt-6 flex items-center justify-center gap-4 text-sm text-muted-foreground">
                <Button
                  variant="secondary"
                  disabled={profile.harnesses.page <= 1}
                  onClick={() => setParams({ page: String(profile.harnesses.page - 1) })}
                >
                  Previous
                </Button>
                <span>
                  Page {profile.harnesses.page} of{' '}
                  {Math.ceil(profile.harnesses.total / profile.harnesses.pageSize)}
                </span>
                <Button
                  variant="secondary"
                  disabled={
                    profile.harnesses.page * profile.harnesses.pageSize >= profile.harnesses.total
                  }
                  onClick={() => setParams({ page: String(profile.harnesses.page + 1) })}
                >
                  Next
                </Button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function profileValues(profile: OwnUserProfile): ProfileUpdate {
  const { name, bio, location, company, website, github } = profile;
  return { name, bio, location, company, website, github, revision: profile.account.revision };
}

export function EditProfilePage() {
  const resource = useResource<OwnUserProfile>('/users/me');
  if (resource.loading) return <Loading />;
  if (resource.error) return <ErrorBox message={resource.error} retry={resource.reload} />;
  return resource.data ? <ProfileForm key={resource.data.id} profile={resource.data} /> : null;
}

function ProfileForm({ profile }: { profile: OwnUserProfile }) {
  const [values, setValues] = useState(() => profileValues(profile));
  const [baseline, setBaseline] = useState(() => profileValues(profile));
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [latest, setLatest] = useState<OwnUserProfile | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  function change(field: keyof ProfileUpdate, value: string) {
    setValues((previous) => ({ ...previous, [field]: value }));
    setIssues((previous) => ({ ...previous, [field]: '' }));
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    const result = profileUpdateSchema.safeParse(values);
    if (!result.success) {
      const errors = Object.fromEntries(
        result.error.issues.map((issue) => [String(issue.path[0]), issue.message]),
      );
      setIssues(errors);
      setError('Check the highlighted fields. Your edits have been kept.');
      const field = String(result.error.issues[0]?.path[0]);
      form.current?.querySelector<HTMLElement>('[name="' + field + '"]')?.focus();
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { data } = await api.patch<OwnUserProfile>('/users/me', result.data);
      dispatch(
        sessionChanged({
          id: data.id,
          name: data.name,
          email: data.account.email,
          role: data.account.role,
        }),
      );
      dispatch(notify('Profile updated.'));
      navigate('/profile');
    } catch (failure) {
      setError(errorMessage(failure));
      if (
        typeof failure === 'object' &&
        failure &&
        'response' in failure &&
        (failure.response as { status?: number })?.status === 409
      ) {
        try {
          setLatest((await api.get<OwnUserProfile>('/users/me')).data);
        } catch {
          /* Preserve the original error and local edits. */
        }
      }
    } finally {
      setBusy(false);
    }
  }
  const dirty = JSON.stringify(values) !== JSON.stringify(baseline);
  return (
    <div className="mx-auto w-full max-w-6xl">
      <Link
        className="mb-5 inline-flex min-h-8 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        to="/profile"
      >
        <ArrowLeft size={16} /> Back to profile
      </Link>
      <PageTitle
        title="Edit your profile"
        description="Help others understand the person behind your Harnesses. These details appear on your public profile."
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,45rem)_minmax(16rem,1fr)] lg:gap-8">
        <Card className="min-w-0 [--card-spacing:--spacing(5)] sm:[--card-spacing:--spacing(7)]">
          <CardContent>
            <form ref={form} onSubmit={(event) => void save(event)} noValidate>
              <h2 className="text-xl font-semibold text-foreground">Public details</h2>
              <p className="mt-2 mb-6 text-sm text-muted-foreground">
                Your email and credentials are never part of your public profile.
              </p>
              {error && (
                <div className="mb-6">
                  <ErrorBox message={error} />
                </div>
              )}
              {latest && (
                <section
                  className="mb-6 rounded-lg border border-border bg-warning-surface p-4"
                  data-testid="profile-conflict"
                >
                  <h3 className="font-semibold text-foreground">Review the latest profile</h3>
                  <p className="my-2 text-sm text-foreground/80">
                    Another session saved different details. Compare them before choosing which
                    edits to keep.
                  </p>
                  <dl className="my-4 grid gap-2">
                    {(['name', 'bio', 'location', 'company', 'website', 'github'] as const)
                      .filter((key) => latest[key] !== values[key])
                      .map((key) => (
                        <div key={key}>
                          <dt className="text-sm font-semibold text-foreground capitalize">
                            {key}
                          </dt>
                          <dd className="m-0 text-sm break-words whitespace-pre-wrap text-foreground/80">
                            {latest[key] || '(empty)'}
                          </dd>
                        </div>
                      ))}
                  </dl>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setValues(profileValues(latest));
                        setBaseline(profileValues(latest));
                        dispatch(
                          sessionChanged({
                            id: latest.id,
                            name: latest.name,
                            email: latest.account.email,
                            role: latest.account.role,
                          }),
                        );
                        setLatest(null);
                        setError('');
                      }}
                    >
                      Use latest profile
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setValues((previous) => ({
                          ...previous,
                          revision: latest.account.revision,
                        }));
                        setBaseline(profileValues(latest));
                        setLatest(null);
                        setError('');
                      }}
                    >
                      Keep my edits
                    </Button>
                  </div>
                </section>
              )}
              <fieldset disabled={busy} className="m-0 min-w-0 border-0 p-0">
                <div className={cn(issues.name && invalidHint)}>
                  <Field
                    label="Display name"
                    hint={issues.name || 'This name appears beside your Harnesses.'}
                  >
                    <Input
                      name="name"
                      autoComplete="name"
                      value={values.name}
                      onChange={(event) => change('name', event.target.value)}
                      maxLength={120}
                      required
                      aria-invalid={!!issues.name}
                    />
                  </Field>
                </div>
                <div className={cn(issues.bio && invalidHint)}>
                  <Field label="Bio" hint={issues.bio || values.bio.length + '/600 characters'}>
                    <Textarea
                      name="bio"
                      value={values.bio}
                      onChange={(event) => change('bio', event.target.value)}
                      rows={4}
                      maxLength={600}
                      placeholder="What do you build? Which tasks do your Harnesses help with?"
                      aria-invalid={!!issues.bio}
                      className="resize-y"
                    />
                  </Field>
                </div>
                <div className="grid gap-x-5 sm:grid-cols-2">
                  <div className={cn(issues.location && invalidHint)}>
                    <Field label="Location" hint={issues.location}>
                      <Input
                        name="location"
                        autoComplete="address-level2"
                        value={values.location}
                        maxLength={100}
                        onChange={(event) => change('location', event.target.value)}
                        placeholder="City or region"
                        aria-invalid={!!issues.location}
                      />
                    </Field>
                  </div>
                  <div className={cn(issues.company && invalidHint)}>
                    <Field label="Company or team" hint={issues.company}>
                      <Input
                        name="company"
                        autoComplete="organization"
                        value={values.company}
                        maxLength={100}
                        onChange={(event) => change('company', event.target.value)}
                        placeholder="Where you build"
                        aria-invalid={!!issues.company}
                      />
                    </Field>
                  </div>
                </div>
                <div className={cn(issues.website && invalidHint)}>
                  <Field label="Website" hint={issues.website || 'Include https:// or http://.'}>
                    <Input
                      name="website"
                      type="url"
                      autoComplete="url"
                      value={values.website}
                      maxLength={500}
                      onChange={(event) => change('website', event.target.value)}
                      placeholder="https://example.com"
                      aria-invalid={!!issues.website}
                    />
                  </Field>
                </div>
                <div className={cn(issues.github && invalidHint)}>
                  <Field
                    label="GitHub username"
                    hint={issues.github || 'Your username only, without @ or a profile URL.'}
                  >
                    <Input
                      name="github"
                      value={values.github}
                      maxLength={39}
                      onChange={(event) => change('github', event.target.value)}
                      placeholder="your-username"
                      aria-invalid={!!issues.github}
                    />
                  </Field>
                </div>
                <Separator className="mb-5" />
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="submit" disabled={!dirty || !!latest}>
                    {busy ? 'Saving…' : 'Save profile'}
                  </Button>
                  <Link
                    className={cn(
                      buttonVariants({ variant: 'outline', size: 'lg' }),
                      'h-10 gap-2 px-4 font-semibold',
                    )}
                    to="/profile"
                  >
                    Cancel
                  </Link>
                  <span className="text-sm text-muted-foreground max-sm:w-full" role="status">
                    {dirty ? 'Unsaved changes' : 'All changes saved'}
                  </span>
                </div>
              </fieldset>
            </form>
          </CardContent>
        </Card>
        <aside className="grid min-w-0 gap-6 md:grid-cols-2 lg:grid-cols-1">
          <Card className={cardPadding}>
            <CardContent className="flex flex-col">
              <p className="mb-5 text-[11px] font-semibold tracking-widest text-brand">
                PROFILE PREVIEW
              </p>
              <ProfileAvatar name={initials(values.name) || '?'} />
              <h2 className="text-xl font-semibold tracking-tight break-words text-foreground">
                {values.name || 'Your name'}
              </h2>
              <p
                className="mt-3 mb-3 break-words whitespace-pre-wrap text-foreground/80"
                data-testid="profile-bio"
              >
                {values.bio || 'Your bio will appear here.'}
              </p>
              {values.company && (
                <p className="mt-1 flex items-center gap-2 break-words text-sm text-muted-foreground">
                  <Building2 size={15} className="shrink-0" />
                  {values.company}
                </p>
              )}
              {values.location && (
                <p className="mt-1 flex items-center gap-2 break-words text-sm text-muted-foreground">
                  <MapPin size={15} className="shrink-0" />
                  {values.location}
                </p>
              )}
            </CardContent>
          </Card>
          <Card className={cardPadding}>
            <CardContent className="flex flex-col">
              <h3 className="mb-4 flex items-center gap-2 font-semibold text-foreground">
                <ShieldCheck size={17} className="text-brand" /> Account & access
              </h3>
              <p className="mb-2 text-sm break-all text-foreground" data-testid="profile-email">
                {profile.account.email}
              </p>
              <p className="mb-3 flex items-center gap-1.5 text-xs text-success">
                <CheckCircle2 size={14} />
                Email {profile.account.verified ? 'verified' : 'not verified'}
              </p>
              <p className="text-sm text-muted-foreground">
                Public profile edits do not change your email, password, or Harness permissions.
              </p>
              <div className="mt-4 flex flex-col">
                <Link to="/devices" className={accountLink}>
                  <Terminal size={16} /> Manage connected devices
                  <ArrowUpRight size={14} className="ml-auto" />
                </Link>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
