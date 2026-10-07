import { useEffect, useId, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, MailCheck, RefreshCw } from 'lucide-react';
import { otpSchema, type AuthResponse } from '@skillshare/contracts';
import { transport, errorMessage } from '../../lib/http';
import { Button, ErrorBox, Field } from '../../components/ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { AuthShell, InfoNote } from './AuthShell';
import { returnPath } from './return-path';

function CodeField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="mb-5 grid gap-2">
      <Label htmlFor={id} className="font-semibold">
        {label}
      </Label>
      <InputOTP
        id={id}
        required
        maxLength={6}
        inputMode="numeric"
        pattern="^[0-9]+$"
        autoComplete="one-time-code"
        value={value}
        onChange={(v) => onChange(v.replace(/\D/g, '').slice(0, 6))}
        aria-describedby={hint ? `${id}-hint` : undefined}
      >
        <InputOTPGroup>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <InputOTPSlot key={i} index={i} className="size-11 text-lg sm:size-12" />
          ))}
        </InputOTPGroup>
      </InputOTP>
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

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
    <AuthShell
      backTo={'/login?returnTo=' + encodeURIComponent(returnPath(params.get('returnTo')))}
      backLabel="Sign in"
      icon={MailCheck}
      eyebrow="ONE LAST STEP"
      title="Check your inbox."
      description={
        <>
          Enter the six-digit code we sent to{' '}
          <strong className="text-foreground">{email || 'your email address'}</strong>. It expires
          in 10 minutes.
        </>
      }
    >
      {error && <ErrorBox message={error} />}
      <form onSubmit={verify}>
        <Field label="Email address">
          <Input required type="email" autoComplete="email" value={email} readOnly />
        </Field>
        <CodeField
          label="Six-digit code"
          hint="For your security, the code can only be used once."
          value={code}
          onChange={setCode}
        />
        <Button disabled={busy || code.length !== 6} className="w-full">
          {busy ? 'Verifying…' : 'Verify email'}
          <ArrowRight size={16} />
        </Button>
      </form>
      <div className="flex flex-col items-start justify-between gap-1 text-sm text-muted-foreground sm:flex-row sm:items-center sm:gap-3">
        <span>Didn't receive it? Check spam or</span>
        <Button
          type="button"
          variant="ghost"
          className="h-9 px-2 text-primary"
          disabled={busy || seconds > 0 || !email}
          onClick={() => void resend()}
        >
          <RefreshCw size={14} />
          {seconds > 0 ? `Resend in ${seconds}s` : sent ? 'Send a new code' : 'Resend code'}
        </Button>
      </div>
      <InfoNote>
        SkillShare staff will never ask you to share this code. If this wasn't you, you can ignore
        this email.
      </InfoNote>
    </AuthShell>
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
    <AuthShell
      backTo={'/login?returnTo=' + encodeURIComponent(returnPath(params.get('returnTo')))}
      backLabel="Back to sign in"
      icon={MailCheck}
      eyebrow="ACCOUNT RECOVERY"
      title={
        step === 'done'
          ? 'Password updated'
          : step === 'request'
            ? 'Forgot your password?'
            : step === 'code'
              ? 'Check your inbox.'
              : 'Choose a new password.'
      }
      description={
        step === 'request'
          ? 'Enter your account email. If an account is eligible, we will send a one-time reset code.'
          : step === 'code'
            ? `Enter the six-digit reset code sent to ${email}.`
            : step === 'password'
              ? 'Choose a new password. Your other signed-in sessions will be ended.'
              : 'You can now sign in with your new password.'
      }
    >
      {error && <ErrorBox message={error} />}
      {step === 'request' && (
        <form onSubmit={requestCode} className="grid gap-5">
          <div>
            <Field label="Email address">
              <Input
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
          </div>
          <InfoNote>
            To protect account privacy, the confirmation is the same whether or not an account is
            registered.
          </InfoNote>
        </form>
      )}
      {step === 'code' && (
        <form onSubmit={verifyCode}>
          <CodeField label="Six-digit reset code" value={code} onChange={setCode} />
          <Button disabled={busy || code.length !== 6} className="w-full">
            Verify code
            <ArrowRight size={16} />
          </Button>
          <div className="mt-5 flex flex-col items-start justify-between gap-1 text-sm text-muted-foreground sm:flex-row sm:items-center sm:gap-3">
            <span>Didn't receive it?</span>
            <Button
              type="button"
              variant="ghost"
              className="h-9 px-2 text-primary"
              disabled={busy || seconds > 0}
              onClick={() => void resend()}
            >
              {seconds > 0 ? `Resend in ${seconds}s` : 'Resend code'}
            </Button>
          </div>
        </form>
      )}
      {step === 'password' && (
        <form onSubmit={reset}>
          <Field label="New password" hint="Use at least 12 characters.">
            <Input
              required
              type="password"
              minLength={12}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label="Confirm new password">
            <Input
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
    </AuthShell>
  );
}
