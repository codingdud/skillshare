import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, errorMessage, transport } from '../../lib/http';
import { useAppSelector } from '../../app/hooks';
import { Button, ErrorBox, Field, PageTitle } from '../../components/ui';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
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
    <Card className="mx-auto w-full max-w-2xl gap-6 py-8" data-testid="device-approval">
      <CardHeader className="px-8">
        <CardTitle className="text-2xl font-semibold tracking-tight">
          <h1>Authorize SkillSync CLI</h1>
        </CardTitle>
        <CardDescription className="text-base">
          Only approve a request you started in your terminal. Match the code before granting
          access.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 px-8">
        {error && <ErrorBox message={error} />}
        {done ? (
          <p
            role="status"
            className="rounded-lg border border-success/30 bg-success/10 p-4 font-medium text-success"
          >
            {done}
          </p>
        ) : !user ? (
          <Link
            className={cn(buttonVariants({ size: 'lg' }), 'h-10 w-fit px-4 font-semibold')}
            to={'/login?returnTo=' + encodeURIComponent(destination)}
          >
            Sign in to authorize CLI
          </Link>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Signed in as <strong className="font-semibold text-foreground">{user.email}</strong>
            </p>
            <form onSubmit={lookup} className="grid gap-1">
              <Field label="Code displayed in your terminal">
                <Input
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    setRequest(null);
                  }}
                  pattern="[A-Z2-9]{4}-[A-Z2-9]{4}"
                  required
                  maxLength={9}
                  className="h-12 max-w-xs font-mono text-lg tracking-widest"
                />
              </Field>
              <Button disabled={busy} className="w-fit">
                Review request
              </Button>
            </form>
            {request && (
              <div className="grid gap-4 rounded-xl border bg-muted/40 p-5">
                <div className="grid gap-1">
                  <h2 className="text-lg font-semibold text-foreground">{request.label}</h2>
                  <p className="text-sm text-muted-foreground">
                    Requested permissions: {request.scopes.join(', ')}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Expires {new Date(request.expiresAt).toLocaleTimeString()}
                  </p>
                </div>
                <Separator />
                <label className="flex items-center gap-3 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={restricted}
                    onChange={(e) => setRestricted(e.target.checked)}
                  />
                  Restrict this session to selected Harnesses
                </label>
                {restricted ? (
                  <Field label="Harness IDs (separated by commas)">
                    <Input
                      value={harnessIds}
                      onChange={(e) => setHarnessIds(e.target.value)}
                      placeholder="Copy IDs from the Harness CLI page"
                    />
                  </Field>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Account-wide access to Harnesses you are permitted to use, including future
                    memberships.
                  </p>
                )}
                <label className="flex items-center gap-3 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={matched}
                    onChange={(e) => setMatched(e.target.checked)}
                  />
                  The code {code} matches my terminal.
                </label>
                <div className="flex flex-wrap gap-3">
                  <Button disabled={busy || !matched} onClick={() => void decide(true)}>
                    Authorize CLI
                  </Button>
                  <Button variant="secondary" disabled={busy} onClick={() => void decide(false)}>
                    Deny
                  </Button>
                </div>
              </div>
            )}
            <button
              type="button"
              className="w-fit text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
              onClick={() => void transport.logout()}
            >
              Sign out to switch account
            </button>
          </>
        )}
      </CardContent>
      <CardFooter className="mx-8 rounded-none border-t bg-transparent px-0 pb-0">
        <Link
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          to="/devices"
        >
          Manage connected devices
        </Link>
      </CardFooter>
    </Card>
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
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <Card key={item.id} data-testid="device-card">
            <CardHeader>
              <CardTitle className="text-base font-semibold">
                <h2>{item.label}</h2>
              </CardTitle>
              <CardDescription className="break-words">{item.scopes.join(', ')}</CardDescription>
              <CardAction>
                <Badge variant={item.revoked ? 'outline' : 'secondary'}>
                  {item.revoked ? 'Inactive' : 'Active'}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm text-muted-foreground">
              <p className="break-words">
                {item.harnessGrants
                  ? 'Harnesses: ' + item.harnessGrants.join(', ')
                  : 'Account-wide Harness access'}
              </p>
              <p>
                Last active {new Date(item.lastUsedAt).toLocaleString()} · Expires{' '}
                {new Date(item.expiresAt).toLocaleString()}
              </p>
            </CardContent>
            <CardFooter className="justify-end">
              <Button
                variant="secondary"
                disabled={item.revoked || busy === item.id}
                onClick={() => void revoke(item.id)}
              >
                {item.revoked ? 'Revoked' : 'Revoke session'}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
      {!items.length && !error && (
        <p className="rounded-xl border border-dashed bg-card px-6 py-12 text-center text-muted-foreground">
          No CLI sessions yet. Run{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground">
            sks setup
          </code>{' '}
          in your codebase.
        </p>
      )}
    </>
  );
}
