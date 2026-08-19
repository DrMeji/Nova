import { useEffect, useState, type ReactNode } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import { getLocalPrefs } from '@/lib/localPrefs';
import { hasPinSet, lockPinSession, shouldLockOnLaunch, verifyPin } from '@/lib/pinLock';
import { hasSecondFactorSet, verifySecondFactor } from '@/lib/twoFactor';

type UnlockStep = 'pin' | '2fa';

export function PinLockGate({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState(() => shouldLockOnLaunch(getLocalPrefs().requirePinOnLaunch));
  const [step, setStep] = useState<UnlockStep>('pin');
  const [pin, setPin] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const onLock = () => {
      if (getLocalPrefs().requirePinOnLaunch && hasPinSet()) {
        setStep('pin');
        setCode('');
        setPin('');
        setLocked(true);
      }
    };
    window.addEventListener('ark:pin-lock', onLock);
    return () => window.removeEventListener('ark:pin-lock', onLock);
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
    const ok = await verifyPin(pin);
    if (!ok) {
      setError('Wrong PIN');
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
            : 'Enter your local PIN for this PC.'}
        </p>
        {step === 'pin' ? (
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
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
          onClick={() => void (step === 'pin' ? submitPin() : submit2fa())}
        >
          Unlock
        </button>
      </div>
    </div>
  );
}
