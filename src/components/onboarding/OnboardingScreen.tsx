import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ArkLogo } from '@/components/branding/ArkLogo';
import { completeOnboarding, detectHardware, getRecommendedModel, type HardwareInfo } from '@/lib/api';
import { Loader2, Cpu, MemoryStick, HardDrive, Zap, CheckCircle2, Download, Monitor, MonitorCog } from 'lucide-react';

const STEPS = [
  'Detecting operating system...',
  'Checking CPU and memory...',
  'Detecting GPU and acceleration...',
  'Verifying available storage...',
  'Selecting optimal AI model...',
];

export function OnboardingScreen() {
  const { user, refreshProfile } = useAuth();
  const [step, setStep] = useState(0);
  const [hw, setHw] = useState<HardwareInfo | null>(null);
  const [recommendation, setRecommendation] = useState<{ name: string; size: string } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    STEPS.forEach((_, i) => {
      timers.push(setTimeout(() => setStep(i), i * 700));
    });
    timers.push(setTimeout(() => {
      const detected = detectHardware();
      setHw(detected);
      setRecommendation(getRecommendedModel(detected));
    }, STEPS.length * 700));
    return () => timers.forEach(clearTimeout);
  }, []);

  const handleContinue = async () => {
    setDownloading(true);
    const interval = setInterval(() => {
      setDownloadProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          (async () => {
            await completeOnboarding();
            await refreshProfile();
          })();
          return 100;
        }
        return prev + 2;
      });
    }, 50);
  };

  const isDetectionComplete = hw !== null;

  return (
    <div className="min-h-screen bg-ark-navy-950 flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-ark-blue-500/8 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-[500px] animate-fade-in">
        <div className="flex flex-col items-center mb-8">
          <ArkLogo size={48} />
          <h1 className="mt-4 text-xl font-bold text-content-primary">Preparing ARK</h1>
          <p className="mt-1 text-sm text-content-secondary">Setting up for your computer, {user?.email?.split('@')[0]}</p>
        </div>

        {!isDetectionComplete ? (
          <div className="ark-card p-6 animate-slide-up">
            <div className="space-y-3">
              {STEPS.map((label, i) => (
                <div key={i} className="flex items-center gap-3">
                  {i < step ? (
                    <CheckCircle2 className="w-5 h-5 text-ark-accent-green shrink-0" />
                  ) : i === step ? (
                    <Loader2 className="w-5 h-5 text-ark-blue-400 shrink-0 animate-spin" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-surface-border-light shrink-0" />
                  )}
                  <span className={`text-sm ${i <= step ? 'text-content-primary' : 'text-content-tertiary'}`}>
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : !downloading ? (
          <div className="ark-card p-6 animate-slide-up space-y-5">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-ark-accent-green/10 mb-3">
                <CheckCircle2 className="w-6 h-6 text-ark-accent-green" />
              </div>
              <h2 className="text-lg font-semibold text-content-primary">Your computer is ready</h2>
            </div>

            {/* Hardware summary */}
            <div className="grid grid-cols-2 gap-3">
              <HwCard icon={Monitor} label="OS" value={hw.os} />
              <HwCard icon={Cpu} label="CPU" value={hw.cpu} />
              <HwCard icon={MemoryStick} label="RAM" value={hw.ram} />
              <HwCard icon={MonitorCog} label="GPU" value={hw.gpu.length > 20 ? hw.gpu.slice(0, 20) + '...' : hw.gpu} />
              <HwCard icon={Zap} label="Acceleration" value={hw.acceleration} />
              <HwCard icon={HardDrive} label="Storage" value={hw.storage} />
            </div>

            {/* Recommended model */}
            {recommendation && (
              <div className="bg-ark-blue-500/10 border border-ark-blue-500/20 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-content-secondary mb-1">Recommended Local AI</p>
                    <p className="text-sm font-semibold text-content-primary">{recommendation.name}</p>
                    <p className="text-xs text-content-tertiary mt-0.5">Model size: {recommendation.size}</p>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-ark-blue-500/20 flex items-center justify-center shrink-0">
                    <Download className="w-5 h-5 text-ark-blue-300" />
                  </div>
                </div>
              </div>
            )}

            <button onClick={handleContinue} className="ark-btn-primary w-full">
              <Download className="w-4 h-4" />
              Download & Continue
            </button>
          </div>
        ) : (
          <div className="ark-card p-6 animate-slide-up space-y-4">
            <div className="text-center">
              <h2 className="text-lg font-semibold text-content-primary mb-1">Downloading AI Model</h2>
              <p className="text-sm text-content-secondary">{recommendation?.name}</p>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs text-content-secondary">
                <span>Downloading model files...</span>
                <span>{Math.round(downloadProgress)}%</span>
              </div>
              <div className="h-2 bg-ark-navy-900 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-ark-blue-500 to-ark-blue-400 rounded-full transition-all duration-75"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
            </div>

            {downloadProgress >= 100 && (
              <div className="flex items-center gap-2 text-sm text-ark-accent-green animate-fade-in">
                <CheckCircle2 className="w-4 h-4" />
                Model ready. Launching ARK...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function HwCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="bg-ark-navy-900 border border-surface-border rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-3.5 h-3.5 text-content-tertiary" />
        <span className="text-2xs uppercase tracking-wider text-content-tertiary">{label}</span>
      </div>
      <p className="text-sm text-content-primary truncate">{value}</p>
    </div>
  );
}
