import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, MailCheck, RefreshCw } from 'lucide-react';
import { otpSchema, type AuthResponse } from '@skillshare/contracts';
import { transport, errorMessage } from '../../lib/http';
import { Button, ErrorBox, Field, PageTitle } from '../../components/ui';
import { returnPath } from './return-path';

export function OtpPage() {
  const [params] = useSearchParams(),
    navigate = useNavigate();
  const email = params.get('email') ?? '';
  const [code, setCode] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [seconds, setSeconds] = useState(0),
    [sent, setSent] = useState(false);
  useEffect(() => {
    if (seconds <= 0) return;
    const timer = window.setTimeout(() => setSeconds((v) => Math.max(0, v - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [seconds]);
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const result = otpSchema.safeParse({ email, code });
    if (!result.success) {
      setError(result.error.issues.map((i) => i.message).join(' '));
      return;
    }
    setBusy(true);
    try {
      const { data } = await transport.auth.post<AuthResponse>('/verify-email', result.data);
      transport.setSession(data);
      navigate(returnPath(params.get('returnTo')));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    setError('');
    setBusy(true);
    try {
      const { data } = await transport.auth.post('/resend-verification', { email });
      setSent(true);
      setSeconds(data.retryAfterSeconds ?? 60);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout single-auth">
      <section className="panel auth-form">
        <Link
          className="back-link"
          to={'/login?returnTo=' + encodeURIComponent(returnPath(params.get('returnTo')))}
        >
          <ArrowLeft size={15} />
          Sign in
        </Link>
        <div className="auth-icon">
          <MailCheck size={24} />
        </div>
        <p className="eyebrow">ONE LAST STEP</p>
        <h1>Check your inbox.</h1>
        <p className="text-slate-500 mt-3 mb-7">
          Enter the six-digit code we sent to{' '}
          <strong className="text-slate-700">{email || 'your email address'}</strong>. It expires in
          10 minutes.
        </p>
        {error && <ErrorBox message={error} />}
        <form onSubmit={verify}>
          <Field label="Email address">
            <input required type="email" autoComplete="email" value={email} readOnly />
          </Field>
          <Field label="Six-digit code" hint="For your security, the code can only be used once.">
            <input
              required
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </Field>
          <Button disabled={busy || code.length !== 6} className="w-full">
            {busy ? 'Verifying…' : 'Verify email'}
            <ArrowRight size={16} />
          </Button>
        </form>
        <div className="resend-row">
          <span>Didn't receive it? Check spam or</span>
          <button
            type="button"
            disabled={busy || seconds > 0 || !email}
            onClick={() => void resend()}
          >
            <RefreshCw size={14} />
            {seconds > 0 ? `Resend in ${seconds}s` : sent ? 'Send a new code' : 'Resend code'}
          </button>
        </div>
        <p className="info-note mt-5">
          SkillShare staff will never ask you to share this code. If this wasn't you, you can ignore
          this email.
        </p>
      </section>
    </div>
  );
}

export function ForgotPasswordPage() {
  const [params] = useSearchParams(),
    navigate = useNavigate();
  const [email, setEmail] = useState(params.get('email') ?? ''),
    [code, setCode] = useState(''),
    [ticket, setTicket] = useState(''),
    [password, setPassword] = useState(''),
    [confirm, setConfirm] = useState(''),
    [step, setStep] = useState<'request' | 'code' | 'password' | 'done'>('request'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);
  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await transport.auth.post('/forgot-password', { email });
      setSeconds(data.retryAfterSeconds ?? 60);
      setStep('code');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    const parsed = otpSchema.safeParse({ email, code });
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(' '));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { data } = await transport.auth.post('/verify-password-reset', parsed.data);
      setTicket(data.resetTicket);
      setStep('password');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    setBusy(true);
    setError('');
    try {
      const { data } = await transport.auth.post('/forgot-password', { email });
      setSeconds(data.retryAfterSeconds ?? 60);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function reset(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('Those passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await transport.auth.post('/reset-password', { resetTicket: ticket, password });
      setStep('done');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout single-auth">
      <section className="panel auth-form">
        <Link
          className="back-link"
          to={'/login?returnTo=' + encodeURIComponent(returnPath(params.get('returnTo')))}
        >
          <ArrowLeft size={15} />
          Back to sign in
        </Link>
        <div className="auth-icon">
          <MailCheck size={24} />
        </div>
        <p className="eyebrow">ACCOUNT RECOVERY</p>
        <h1>
          {step === 'done'
            ? 'Password updated'
            : step === 'request'
              ? 'Forgot your password?'
              : step === 'code'
                ? 'Check your inbox.'
                : 'Choose a new password.'}
        </h1>
        <p className="text-slate-500 mt-3 mb-7">
          {step === 'request'
            ? 'Enter your account email. If an account is eligible, we will send a one-time reset code.'
            : step === 'code'
              ? `Enter the six-digit reset code sent to ${email}.`
              : step === 'password'
                ? 'Choose a new password. Your other signed-in sessions will be ended.'
                : 'You can now sign in with your new password.'}
        </p>
        {error && <ErrorBox message={error} />}{' '}
        {step === 'request' && (
          <form onSubmit={requestCode}>
            <Field label="Email address">
              <input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Button disabled={busy} className="w-full">
              {busy ? 'Sending…' : 'Send reset code'}
              <ArrowRight size={16} />
            </Button>
            <p className="info-note mt-5">
              To protect account privacy, the confirmation is the same whether or not an account is
              registered.
            </p>
          </form>
        )}
        {step === 'code' && (
          <form onSubmit={verifyCode}>
            <Field label="Six-digit reset code">
              <input
                required
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </Field>
            <Button disabled={busy || code.length !== 6} className="w-full">
              Verify code
              <ArrowRight size={16} />
            </Button>
            <div className="resend-row">
              <span>Didn't receive it?</span>
              <button type="button" disabled={busy || seconds > 0} onClick={() => void resend()}>
                {seconds > 0 ? `Resend in ${seconds}s` : 'Resend code'}
              </button>
            </div>
          </form>
        )}
        {step === 'password' && (
          <form onSubmit={reset}>
            <Field label="New password" hint="Use at least 12 characters.">
              <input
                required
                type="password"
                minLength={12}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Field label="Confirm new password">
              <input
                required
                type="password"
                minLength={12}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>
            <Button disabled={busy} className="w-full">
              Update password
              <ArrowRight size={16} />
            </Button>
          </form>
        )}
        {step === 'done' && (
          <Button
            className="w-full"
            onClick={() =>
              navigate('/login?returnTo=' + encodeURIComponent(returnPath(params.get('returnTo'))))
            }
          >
            Sign in
          </Button>
        )}
      </section>
    </div>
  );
}
