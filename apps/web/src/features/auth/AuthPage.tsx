import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { GitBranch, ArrowRight } from 'lucide-react';
import { loginSchema, registerSchema, type AuthResponse } from '@skillshare/contracts';
import { transport, errorMessage } from '../../lib/http';
import { Field, Button, ErrorBox } from '../../components/ui';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { returnPath } from './return-path';
export function AuthPage() {
  const [params] = useSearchParams(),
    navigate = useNavigate();
  const register = params.get('mode') === 'register';
  const [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  function fillDemoCredentials() {
    setEmail('demo@skillshare.test');
    setPassword('SkillShare-Demo-2026!');
    setError('');
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const parsed = (register ? registerSchema : loginSchema).safeParse(
      register ? { name, email, password } : { email, password },
    );
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(' · '));
      return;
    }
    setBusy(true);
    try {
      const { data } = await transport.auth.post<
        AuthResponse | { requiresVerification: true; email: string; message: string }
      >(register ? '/register' : '/login', parsed.data);
      if ('requiresVerification' in data) {
        navigate(
          `/verify-email?email=${encodeURIComponent(data.email)}&returnTo=${encodeURIComponent(returnPath(params.get('returnTo')))}`,
        );
        return;
      }
      transport.setSession(data);
      navigate(
        !params.has('returnTo') && data.user.role === 'admin'
          ? '/admin'
          : returnPath(params.get('returnTo')),
      );
    } catch (e) {
      if (!register && e && typeof e === 'object' && 'response' in e) {
        const response = (e as { response?: { data?: { error?: { code?: string } } } }).response;
        if (response?.data?.error?.code === 'EMAIL_UNVERIFIED') {
          navigate(
            `/verify-email?email=${encodeURIComponent(email)}&returnTo=${encodeURIComponent(returnPath(params.get('returnTo')))}`,
          );
          return;
        }
      }
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const returnTo = encodeURIComponent(returnPath(params.get('returnTo')));
  return (
    <div className="mx-auto my-6 grid w-full max-w-5xl items-center gap-10 sm:my-12 lg:grid-cols-2 lg:gap-16">
      <div className="hidden py-5 lg:block">
        <div className="mb-8 grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
          <GitBranch size={26} aria-hidden="true" />
        </div>
        <p className="text-[11px] font-semibold tracking-widest text-muted-foreground">
          A SHARED STARTING POINT
        </p>
        <h1 className="mt-4 mb-5 text-4xl leading-tight font-bold tracking-tight text-foreground">
          Good work deserves
          <br />a head start.
        </h1>
        <p className="max-w-sm leading-relaxed text-muted-foreground">
          Find the right building blocks. Make them your own. Help the next person go further.
        </p>
        <div className="mt-8 flex flex-col items-start gap-2.5 text-sm">
          {['Discover a Harness', 'Adapt the native files', 'Share what works'].map(
            (step, index) => (
              <div key={step} className="contents">
                {index > 0 && (
                  <span aria-hidden="true" className="pl-6 text-text-faint">
                    ↓
                  </span>
                )}
                <span className="rounded-md border border-brand-border bg-brand-surface px-4 py-2 text-brand">
                  {step}
                </span>
              </div>
            ),
          )}
        </div>
      </div>
      <Card className="[--card-spacing:--spacing(6)] sm:[--card-spacing:--spacing(8)]">
        <CardContent>
          <form onSubmit={submit} className="grid gap-5">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                {register ? 'Create your account' : 'Welcome back'}
              </h2>
              <p className="mt-2 text-muted-foreground">
                {register
                  ? 'A place for your Harnesses, files, and improvements.'
                  : 'Sign in to your personal workspace.'}
              </p>
            </div>
            {error && <ErrorBox message={error} />}
            {!register && import.meta.env.DEV && (
              <Button
                type="button"
                variant="secondary"
                className="w-full border-dashed border-brand-border bg-brand-surface text-brand hover:bg-brand-surface"
                onClick={fillDemoCredentials}
              >
                Fill local demo credentials
              </Button>
            )}
            <div className="grid gap-1">
              {register && (
                <Field label="Your name">
                  <Input
                    required
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>
              )}
              <Field label="Email address">
                <Input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field label="Password" hint={register ? 'At least 12 characters.' : ''}>
                <Input
                  type="password"
                  required
                  minLength={register ? 12 : 1}
                  autoComplete={register ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              {!register && (
                <Link
                  className="-mt-2 mb-1 w-fit self-end text-sm font-semibold text-primary hover:underline"
                  to={
                    '/forgot-password?email=' + encodeURIComponent(email) + '&returnTo=' + returnTo
                  }
                >
                  Forgot password?
                </Link>
              )}
            </div>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}
              <ArrowRight size={16} />
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {register ? 'Already have an account?' : 'New to SkillShare?'}{' '}
              <Link
                className="font-semibold text-primary hover:underline"
                to={(register ? '/login?' : '/login?mode=register&') + 'returnTo=' + returnTo}
              >
                {register ? 'Sign in' : 'Create an account'}
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
