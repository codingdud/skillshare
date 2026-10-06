import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { GitBranch, ArrowRight } from 'lucide-react';
import { loginSchema, registerSchema, type AuthResponse } from '@skillshare/contracts';
import { transport, errorMessage } from '../../lib/http';
import { Field, Button, ErrorBox } from '../../components/ui';
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
  return (
    <div className="auth-layout">
      <div className="auth-story">
        <div className="brand-mark mb-8">
          <GitBranch size={26} />
        </div>
        <p className="eyebrow">A SHARED STARTING POINT</p>
        <h1>
          Good work deserves
          <br />a head start.
        </h1>
        <p>Find the right building blocks. Make them your own. Help the next person go further.</p>
        <div className="auth-lineage">
          <span>Discover a Harness</span>
          <span>↓</span>
          <span>Adapt the native files</span>
          <span>↓</span>
          <span>Share what works</span>
        </div>
      </div>
      <form className="panel auth-form" onSubmit={submit}>
        <h2>{register ? 'Create your account' : 'Welcome back'}</h2>
        <p className="text-slate-500 mb-7">
          {register
            ? 'A place for your Harnesses, files, and improvements.'
            : 'Sign in to your personal workspace.'}
        </p>
        {error && <ErrorBox message={error} />}{' '}
        {!register && import.meta.env.DEV && (
          <button type="button" className="demo-credentials" onClick={fillDemoCredentials}>
            Fill local demo credentials
          </button>
        )}
        {!register && (
          <Link
            className="forgot-link"
            to={
              '/forgot-password?email=' +
              encodeURIComponent(email) +
              '&returnTo=' +
              encodeURIComponent(returnPath(params.get('returnTo')))
            }
          >
            Forgot password?
          </Link>
        )}
        {register && (
          <Field label="Your name">
            <input
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
        )}
        <Field label="Email address">
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password" hint={register ? 'At least 12 characters.' : ''}>
          <input
            type="password"
            required
            minLength={register ? 12 : 1}
            autoComplete={register ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}
          <ArrowRight size={16} />
        </Button>
        <p className="mt-6 text-center text-sm text-slate-500">
          {register ? 'Already have an account?' : 'New to SkillShare?'}{' '}
          <Link
            className="text-indigo-700 font-semibold"
            to={
              (register ? '/login?' : '/login?mode=register&') +
              'returnTo=' +
              encodeURIComponent(returnPath(params.get('returnTo')))
            }
          >
            {register ? 'Sign in' : 'Create an account'}
          </Link>
        </p>
      </form>
    </div>
  );
}
