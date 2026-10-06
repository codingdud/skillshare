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
  formatDate,
} from '../../components/ui';
import './profile.css';

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
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
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.origin + '/users/' + profile.id);
      dispatch(notify('Public profile link copied.'));
    } catch {
      dispatch(notify('Could not copy the link. Open your public profile and copy its address.'));
    }
  }
  return (
    <div className="profile-page">
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
      <div className="profile-grid">
        <aside className="profile-sidebar">
          <section className="panel profile-identity">
            <div className="profile-avatar" aria-hidden="true">
              {initials(profile.name)}
            </div>
            <h2>{profile.name}</h2>
            <p className="profile-member">Harness creator</p>
            {profile.bio ? (
              <p className="profile-bio">{profile.bio}</p>
            ) : (
              <p className="profile-muted">
                {own
                  ? 'Tell people what you build and how you work.'
                  : 'This creator has not added a bio yet.'}
              </p>
            )}
            <ul className="profile-links">
              {profile.company && (
                <li>
                  <Building2 size={16} />
                  <span>{profile.company}</span>
                </li>
              )}
              {profile.location && (
                <li>
                  <MapPin size={16} />
                  <span>{profile.location}</span>
                </li>
              )}
              {profile.website && (
                <li>
                  <Globe size={16} />
                  <a href={profile.website} target="_blank" rel="noopener noreferrer">
                    {profile.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                    <ArrowUpRight size={13} />
                  </a>
                </li>
              )}
              {profile.github && (
                <li>
                  <GitBranch size={16} />
                  <a
                    href={'https://github.com/' + profile.github}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {profile.github}
                    <ArrowUpRight size={13} />
                  </a>
                </li>
              )}
              <li>
                <CalendarDays size={16} />
                <span>Joined {formatDate(profile.createdAt)}</span>
              </li>
            </ul>
            {own && (
              <Link to="/profile/edit" className="btn btn-secondary profile-edit">
                <Pencil size={15} /> Edit profile
              </Link>
            )}
            {own && (
              <Link className="profile-public-link" to={'/users/' + profile.id}>
                View public profile <ArrowUpRight size={14} />
              </Link>
            )}
          </section>
          {own && (
            <section className="panel profile-account">
              <h3>
                <ShieldCheck size={17} /> Your account
              </h3>
              {account && (
                <>
                  <p className="profile-email">{account.email}</p>
                  <p className="profile-verification">
                    <CheckCircle2 size={14} />
                    {account.verified ? 'Email verified' : 'Verification required'}
                  </p>
                </>
              )}
              <p className="profile-muted">Account details are visible only to you.</p>
              <Link to="/devices">
                <Terminal size={16} /> Connected CLI devices <ArrowUpRight size={14} />
              </Link>
              <Link to="/harnesses">
                <Layers size={16} /> My Harnesses <ArrowUpRight size={14} />
              </Link>
            </section>
          )}
        </aside>
        <div className="profile-content">
          <dl className="profile-stats" aria-label="Public contribution statistics">
            <div>
              <dt>Public Harnesses</dt>
              <dd>{profile.stats.harnesses}</dd>
            </div>
            <div>
              <dt>Published releases</dt>
              <dd>{profile.stats.releases}</dd>
            </div>
            <div>
              <dt>Native files</dt>
              <dd>{profile.stats.files}</dd>
            </div>
          </dl>
          <section className="profile-harnesses" aria-labelledby="profile-harnesses-title">
            <div className="profile-section-heading">
              <div>
                <h2 id="profile-harnesses-title">Public Harnesses</h2>
                <p>Latest published releases, with their original file structure.</p>
              </div>
              {own && (
                <Link to="/harnesses" className="profile-text-link">
                  Manage Harnesses <ArrowUpRight size={15} />
                </Link>
              )}
            </div>
            {profile.harnesses.items.length ? (
              <div className="profile-harness-list">
                {profile.harnesses.items.map((harness) => (
                  <article className="panel profile-harness" key={harness.id}>
                    <div className="profile-harness-heading">
                      <span className="type-badge type-harness">
                        <Layers size={13} /> Harness
                      </span>
                      <span className="version">v{harness.version}</span>
                      <span className="visibility">Public</span>
                    </div>
                    <Link
                      className="profile-harness-title"
                      to={'/harnesses/' + harness.id + '/edit?release=' + harness.releaseId}
                    >
                      {harness.name}
                      <ArrowUpRight size={17} />
                    </Link>
                    <p>{harness.description}</p>
                    <div className="profile-harness-meta">
                      <span>
                        <FileCode2 size={14} /> {harness.fileCount} native files
                      </span>
                      <span>Published {formatDate(harness.updatedAt)}</span>
                    </div>
                  </article>
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
                    <Link className="btn btn-primary" to="/harnesses/new">
                      Create a Harness
                    </Link>
                  ) : (
                    <Link className="btn btn-secondary" to="/">
                      Explore Harnesses
                    </Link>
                  )
                }
              />
            )}
            {profile.harnesses.total > profile.harnesses.pageSize && (
              <div className="pagination">
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
    <div className="profile-page">
      <Link className="profile-back" to="/profile">
        <ArrowLeft size={16} /> Back to profile
      </Link>
      <PageTitle
        title="Edit your profile"
        description="Help others understand the person behind your Harnesses. These details appear on your public profile."
      />
      <div className="profile-edit-grid">
        <form
          ref={form}
          className="panel profile-form"
          onSubmit={(event) => void save(event)}
          noValidate
        >
          <h2>Public details</h2>
          <p className="profile-muted">
            Your email and credentials are never part of your public profile.
          </p>
          {error && <ErrorBox message={error} />}
          {latest && (
            <section className="profile-conflict">
              <h3>Review the latest profile</h3>
              <p>
                Another session saved different details. Compare them before choosing which edits to
                keep.
              </p>
              <dl>
                {(['name', 'bio', 'location', 'company', 'website', 'github'] as const)
                  .filter((key) => latest[key] !== values[key])
                  .map((key) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{latest[key] || '(empty)'}</dd>
                    </div>
                  ))}
              </dl>
              <div className="profile-form-actions">
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
                    setValues((previous) => ({ ...previous, revision: latest.account.revision }));
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
          <fieldset disabled={busy}>
            <div className={issues.name ? 'profile-field-invalid' : ''}>
              <Field
                label="Display name"
                hint={issues.name || 'This name appears beside your Harnesses.'}
              >
                <input
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
            <div className={issues.bio ? 'profile-field-invalid' : ''}>
              <Field label="Bio" hint={issues.bio || values.bio.length + '/600 characters'}>
                <textarea
                  name="bio"
                  value={values.bio}
                  onChange={(event) => change('bio', event.target.value)}
                  rows={4}
                  maxLength={600}
                  placeholder="What do you build? Which tasks do your Harnesses help with?"
                  aria-invalid={!!issues.bio}
                />
              </Field>
            </div>
            <div className="profile-form-columns">
              <div className={issues.location ? 'profile-field-invalid' : ''}>
                <Field label="Location" hint={issues.location}>
                  <input
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
              <div className={issues.company ? 'profile-field-invalid' : ''}>
                <Field label="Company or team" hint={issues.company}>
                  <input
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
            <div className={issues.website ? 'profile-field-invalid' : ''}>
              <Field label="Website" hint={issues.website || 'Include https:// or http://.'}>
                <input
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
            <div className={issues.github ? 'profile-field-invalid' : ''}>
              <Field
                label="GitHub username"
                hint={issues.github || 'Your username only, without @ or a profile URL.'}
              >
                <input
                  name="github"
                  value={values.github}
                  maxLength={39}
                  onChange={(event) => change('github', event.target.value)}
                  placeholder="your-username"
                  aria-invalid={!!issues.github}
                />
              </Field>
            </div>
            <div className="profile-form-actions">
              <Button type="submit" disabled={!dirty || !!latest}>
                {busy ? 'Saving…' : 'Save profile'}
              </Button>
              <Link className="btn btn-secondary" to="/profile">
                Cancel
              </Link>
              <span className="profile-muted" role="status">
                {dirty ? 'Unsaved changes' : 'All changes saved'}
              </span>
            </div>
          </fieldset>
        </form>
        <aside className="profile-edit-aside">
          <section className="panel profile-preview">
            <p className="eyebrow">PROFILE PREVIEW</p>
            <div className="profile-avatar" aria-hidden="true">
              {initials(values.name) || '?'}
            </div>
            <h2>{values.name || 'Your name'}</h2>
            <p className="profile-bio">{values.bio || 'Your bio will appear here.'}</p>
            {values.company && (
              <p>
                <Building2 size={15} />
                {values.company}
              </p>
            )}
            {values.location && (
              <p>
                <MapPin size={15} />
                {values.location}
              </p>
            )}
          </section>
          <section className="panel profile-account">
            <h3>
              <ShieldCheck size={17} /> Account & access
            </h3>
            <p className="profile-email">{profile.account.email}</p>
            <p className="profile-verification">
              <CheckCircle2 size={14} />
              Email {profile.account.verified ? 'verified' : 'not verified'}
            </p>
            <p className="profile-muted">
              Public profile edits do not change your email, password, or Harness permissions.
            </p>
            <Link to="/devices">
              <Terminal size={16} /> Manage connected devices <ArrowUpRight size={14} />
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
