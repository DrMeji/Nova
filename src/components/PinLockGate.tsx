import { useEffect, useState, type ReactNode } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import { getLocalPrefs } from '@/lib/localPrefs';
import { getPinLockoutMs, hasPinSet, lockPinSession, shouldLockOnLaunch, verifyPin } from '@/lib/pinLock';
import { hasSecondFactorSet, verifySecondFactor } from '@/lib/twoFactor';

type UnlockStep = 'pin' | '2fa';

export function PinLockGate({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState(() => shouldLockOnLaunch(getLocalPrefs().requirePinOnLaunch));
  const [step, setStep] = useState<UnlockStep>('pin');
  const [pin, setPin] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [lockoutSeconds, setLockoutSeconds] = useState(() => Math.ceil(getPinLockoutMs() / 1000));

  useEffect(() => {
    if (!locked || lockoutSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setLockoutSeconds(Math.ceil(getPinLockoutMs() / 1000));
    }, 250);
    return () => window.clearInterval(timer);
  }, [locked, lockoutSeconds]);

  useEffect(() => {
    const onLock = () => {
      if (hasPinSet()) {
        setStep('pin');
        setCode('');
        setPin('');
        setLocked(true);
      }
    };
    window.addEventListener('ark:pin-lock', onLock);
    const unsubSleep = window.arkDesktop?.onSystemSuspend?.(() => {
      if (hasPinSet() && getLocalPrefs().lockOnSleep) lockPinSession();
    });
    return () => {
      window.removeEventListener('ark:pin-lock', onLock);
      unsubSleep?.();
    };
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return;
      const prefs = getLocalPrefs();
      if (prefs.autoLockMinutes > 0 && prefs.requirePinOnLaunch && hasPinSet()) {
        lockPinSession();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    const minutes = getLocalPrefs().autoLockMinutes;
    if (!minutes || minutes <= 0) return;
    let timer: number | undefined;
    const arm = () => {
      if (timer) window.clearTimeout(timer);
      if (!getLocalPrefs().requirePinOnLaunch || !hasPinSet()) return;
      timer = window.setTimeout(() => lockPinSession(), minutes * 60_000);
    };
    arm();
    const onUse = () => arm();
    window.addEventListener('pointerdown', onUse);
    window.addEventListener('keydown', onUse);
    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener('pointerdown', onUse);
      window.removeEventListener('keydown', onUse);
    };
  }, [locked]);

  if (!locked) return children;

  const needs2fa = () => getLocalPrefs().twoFactorEnabled && hasSecondFactorSet();

  const submitPin = async () => {
    setError('');
    const remaining = getPinLockoutMs();
    if (remaining > 0) {
      setLockoutSeconds(Math.ceil(remaining / 1000));
      setError(`Too many attempts. Try again in ${Math.ceil(remaining / 1000)}s.`);
      return;
    }
    const ok = await verifyPin(pin);
    if (!ok) {
      const nextRemaining = getPinLockoutMs();
      setLockoutSeconds(Math.ceil(nextRemaining / 1000));
      setError(nextRemaining > 0
        ? `Too many attempts. Try again in ${Math.ceil(nextRemaining / 1000)}s.`
        : 'Wrong PIN');
      setPin('');
      return;
    }
    setPin('');
    if (needs2fa()) {
      setStep('2fa');
      return;
    }
    setLocked(false);
  };

  const submit2fa = async () => {
    setError('');
    const ok = await verifySecondFactor(code);
    if (!ok) {
      setError('Wrong security code');
      setCode('');
      return;
    }
    setCode('');
    setLocked(false);
  };

  return (
    <div className="h-full w-full bg-ark-navy-950 flex items-center justify-center p-6">
      <div className="w-full max-w-xs rounded-2xl border border-surface-border bg-ark-navy-900 p-5 space-y-4">
        <div className="flex items-center gap-2 text-content-primary">
          {step === '2fa' ? <ShieldCheck className="w-4 h-4 text-sky-400" /> : <Lock className="w-4 h-4 text-sky-400" />}
          <p className="text-sm font-medium">{step === '2fa' ? 'Second factor' : 'Unlock ARK'}</p>
        </div>
        <p className="text-xs text-content-tertiary">
          {step === '2fa'
            ? 'Enter your security code for this PC.'
            : 'Enter your local PIN. This locks the app UI on this PC; it does not encrypt your keys.'}
        </p>
        {step === 'pin' ? (
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            disabled={lockoutSeconds > 0}
            onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
            onKeyDown={e => { if (e.key === 'Enter') void submitPin(); }}
            className="w-full rounded-lg border border-surface-border bg-ark-navy-950 px-3 py-2 text-sm tracking-[0.3em] text-center text-content-primary"
            autoFocus
          />
        ) : (
          <input
            type="password"
            autoComplete="off"
            value={code}
            onChange={e => setCode(e.target.value.slice(0, 32))}
            onKeyDown={e => { if (e.key === 'Enter') void submit2fa(); }}
            className="w-full rounded-lg border border-surface-border bg-ark-navy-950 px-3 py-2 text-sm text-center text-content-primary"
            autoFocus
          />
        )}
        {error ? <p className="text-xs text-rose-400">{error}</p> : null}
        <button
          type="button"
          className="ark-btn-primary w-full text-sm"
          disabled={step === 'pin' && lockoutSeconds > 0}
          onClick={() => void (step === 'pin' ? submitPin() : submit2fa())}
        >
          Unlock
        </button>
      </div>
    </div>
  );
}
