import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, errorMessage, transport } from '../../lib/http';
import { useAppSelector } from '../../app/hooks';
import { Button, ErrorBox, Field, PageTitle } from '../../components/ui';
type Consent = { label: string; scopes: string[]; expiresAt: string };
export function DeviceApprovalPage() {
  const [params] = useSearchParams(),
    user = useAppSelector((s) => s.auth.user);
  const [code, setCode] = useState(params.get('code') ?? ''),
    [request, setRequest] = useState<Consent | null>(null);
  const [restricted, setRestricted] = useState(false),
    [harnessIds, setHarnessIds] = useState('');
  const [error, setError] = useState(''),
    [done, setDone] = useState(''),
    [busy, setBusy] = useState(false),
    [matched, setMatched] = useState(false);
  async function lookup(e?: React.FormEvent) {
    e?.preventDefault();
    setError('');
    setBusy(true);
    setRequest(null);
    setMatched(false);
    try {
      setRequest((await api.get('/auth/device-request?code=' + encodeURIComponent(code))).data);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (user && /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code)) void lookup();
  }, [user?.id]);
  async function decide(approve: boolean) {
    setBusy(true);
    setError('');
    try {
      const ids = harnessIds.split(/[\s,]+/).filter(Boolean);
      if (approve && restricted && !ids.length)
        throw new Error('Enter at least one Harness ID, or choose account-wide access.');
      await api.post('/auth/device-decision', {
        code,
        approve,
        ...(approve && restricted ? { harnessIds: ids } : {}),
      });
      setDone(
        approve
          ? 'CLI authorized. Return to your terminal to continue.'
          : 'CLI authorization denied.',
      );
      setRequest(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const destination = '/device?code=' + encodeURIComponent(code);
  return (
    <section className="panel max-w-2xl mx-auto p-8">
      <h1 className="text-2xl font-semibold">Authorize SkillSync CLI</h1>
      <p className="my-4">
        Only approve a request you started in your terminal. Match the code before granting access.
      </p>
      {error && <ErrorBox message={error} />}
      {done ? (
        <p role="status">{done}</p>
      ) : !user ? (
        <Link className="btn btn-primary" to={'/login?returnTo=' + encodeURIComponent(destination)}>
          Sign in to authorize CLI
        </Link>
      ) : (
        <>
          <p className="mb-4">
            Signed in as <strong>{user.email}</strong>
          </p>
          <form onSubmit={lookup}>
            <Field label="Code displayed in your terminal">
              <input
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setRequest(null);
                }}
                pattern="[A-Z2-9]{4}-[A-Z2-9]{4}"
                required
                maxLength={9}
              />
            </Field>
            <Button disabled={busy}>Review request</Button>
          </form>
          {request && (
            <div className="mt-6">
              <h2 className="text-lg font-semibold">{request.label}</h2>
              <p>Requested permissions: {request.scopes.join(', ')}</p>
              <p>Expires {new Date(request.expiresAt).toLocaleTimeString()}</p>
              <label className="flex gap-3 my-4">
                <input
                  type="checkbox"
                  checked={restricted}
                  onChange={(e) => setRestricted(e.target.checked)}
                />
                Restrict this session to selected Harnesses
              </label>
              {restricted ? (
                <Field label="Harness IDs (separated by commas)">
                  <input
                    value={harnessIds}
                    onChange={(e) => setHarnessIds(e.target.value)}
                    placeholder="Copy IDs from the Harness CLI page"
                  />
                </Field>
              ) : (
                <p>
                  Account-wide access to Harnesses you are permitted to use, including future
                  memberships.
                </p>
              )}
              <label className="flex gap-3 my-5">
                <input
                  type="checkbox"
                  checked={matched}
                  onChange={(e) => setMatched(e.target.checked)}
                />
                The code {code} matches my terminal.
              </label>
              <div className="flex gap-3">
                <Button disabled={busy || !matched} onClick={() => void decide(true)}>
                  Authorize CLI
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => void decide(false)}>
                  Deny
                </Button>
              </div>
            </div>
          )}
          <button className="mt-5 underline" onClick={() => void transport.logout()}>
            Sign out to switch account
          </button>
        </>
      )}
      <p className="mt-5">
        <Link to="/devices">Manage connected devices</Link>
      </p>
    </section>
  );
}
type Device = {
  id: string;
  label: string;
  lastUsedAt: string;
  expiresAt: string;
  revoked: boolean;
  scopes: string[];
  harnessGrants: string[] | null;
};
export function ConnectedDevicesPage() {
  const [items, setItems] = useState<Device[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState('');
  async function load() {
    try {
      setItems((await api.get('/auth/devices')).data.items);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function revoke(id: string) {
    setBusy(id);
    setError('');
    try {
      await api.delete('/auth/devices/' + id);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  }
  return (
    <>
      <PageTitle
        title="Connected devices"
        description="Browser-authorized CLI sessions. Revocation stops access and refresh credentials."
      />
      {error && <ErrorBox message={error} />}
      <div className="grid gap-4">
        {items.map((item) => (
          <section className="panel p-5" key={item.id}>
            <h2 className="font-semibold">{item.label}</h2>
            <p>{item.scopes.join(', ')}</p>
            <p>
              {item.harnessGrants
                ? 'Harnesses: ' + item.harnessGrants.join(', ')
                : 'Account-wide Harness access'}
            </p>
            <p>
              Last active {new Date(item.lastUsedAt).toLocaleString()} · Expires{' '}
              {new Date(item.expiresAt).toLocaleString()}
            </p>
            <Button
              variant="secondary"
              disabled={item.revoked || busy === item.id}
              onClick={() => void revoke(item.id)}
            >
              {item.revoked ? 'Revoked' : 'Revoke session'}
            </Button>
          </section>
        ))}
      </div>
      {!items.length && !error && <p>No CLI sessions yet. Run sks setup in your codebase.</p>}
    </>
  );
}
