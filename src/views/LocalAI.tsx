import { useState } from 'react';
import { detectHardware, getRecommendedModel } from '@/lib/api';
import {
  Cpu, MemoryStick, HardDrive, Zap, Monitor, MonitorCog,
  CheckCircle2, Loader2, Power, Activity, Settings as SettingsIcon,
} from 'lucide-react';

export function LocalAI() {
  const [hw] = useState(() => detectHardware());
  const [recommendation] = useState(() => getRecommendedModel(hw));
  const [engineRunning, setEngineRunning] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const specs = [
    { icon: Monitor, label: 'Operating System', value: hw.os },
    { icon: Cpu, label: 'CPU', value: hw.cpu },
    { icon: MemoryStick, label: 'System RAM', value: hw.ram },
    { icon: MonitorCog, label: 'GPU', value: hw.gpu },
    { icon: Zap, label: 'Acceleration', value: hw.acceleration },
    { icon: HardDrive, label: 'Available Storage', value: hw.storage },
  ];

  return (
    <div className="max-w-4xl mx-auto p-8 animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-content-primary">Local AI</h1>
        <p className="text-sm text-content-secondary mt-0.5">Your built-in AI engine runs entirely on your computer</p>
      </div>

      {/* Engine status */}
      <div className="ark-card p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
              engineRunning ? 'bg-ark-accent-green/10' : 'bg-ark-navy-800 border border-surface-border'
            }`}>
              <Cpu className={`w-5 h-5 ${engineRunning ? 'text-ark-accent-green' : 'text-content-tertiary'}`} />
            </div>
            <div>
              <p className="text-sm font-semibold text-content-primary">Inference Engine</p>
              <p className="text-xs text-content-secondary">
                {engineRunning ? 'Running · llama.cpp backend' : 'Stopped'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setEngineRunning(!engineRunning)}
            className={engineRunning ? 'ark-btn-secondary !text-ark-accent-red' : 'ark-btn-primary'}
          >
            <Power className="w-3.5 h-3.5" />
            {engineRunning ? 'Stop Engine' : 'Start Engine'}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <StatusItem label="Status" value={engineRunning ? 'Online' : 'Offline'} color={engineRunning ? 'green' : 'tertiary'} />
          <StatusItem label="Active Model" value={recommendation.name} color="blue" />
          <StatusItem label="Engine" value="llama.cpp" color="primary" />
        </div>
      </div>

      {/* Active model */}
      <div className="ark-card p-5 mb-6">
        <h2 className="text-sm font-semibold text-content-primary mb-3">Active Model</h2>
        <div className="flex items-center justify-between p-4 bg-ark-blue-500/10 border border-ark-blue-500/20 rounded-xl">
          <div>
            <p className="text-sm font-medium text-content-primary">{recommendation.name}</p>
            <p className="text-xs text-content-tertiary mt-0.5">
              {recommendation.size} · Q4_K_M quantization · {hw.acceleration} acceleration
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-ark-accent-green">
            <Activity className="w-3.5 h-3.5" />
            <span>Loaded</span>
          </div>
        </div>
      </div>

      {/* Hardware */}
      <div className="ark-card p-5 mb-6">
        <h2 className="text-sm font-semibold text-content-primary mb-4">Your Hardware</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {specs.map(spec => (
            <div key={spec.label} className="bg-ark-navy-900 border border-surface-border rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <spec.icon className="w-3.5 h-3.5 text-content-tertiary" />
                <span className="text-2xs uppercase tracking-wider text-content-tertiary">{spec.label}</span>
              </div>
              <p className="text-sm text-content-primary truncate">{spec.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Advanced toggle */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-2 text-sm text-content-secondary hover:text-content-primary transition-colors mb-4"
      >
        <SettingsIcon className="w-4 h-4" />
        Advanced Settings
      </button>

      {showAdvanced && (
        <div className="ark-card p-5 animate-slide-up space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-content-primary mb-3">Engine Parameters</h3>
            <div className="space-y-3">
              <AdvancedRow label="Context Window" value="32,768 tokens" />
              <AdvancedRow label="Threads" value={hw.cpu} />
              <AdvancedRow label="Batch Size" value="512" />
              <AdvancedRow label="GPU Layers" value={hw.acceleration === 'CPU' ? '0 (CPU only)' : 'All'} />
              <AdvancedRow label="Flash Attention" value="Enabled" />
              <AdvancedRow label="Mlock" value="Enabled" />
            </div>
          </div>

          <div className="pt-4 border-t border-surface-border">
            <h3 className="text-sm font-semibold text-content-primary mb-3">Performance</h3>
            <div className="grid grid-cols-2 gap-3">
              <AdvancedRow label="Tokens/sec" value="~42 t/s" />
              <AdvancedRow label="Memory Usage" value="5.2 GB" />
              <AdvancedRow label="Model Temperature" value="0.7" />
              <AdvancedRow label="Top-P" value="0.9" />
            </div>
          </div>
        </div>
      )}

      {/* Privacy note */}
      <div className="mt-6 flex items-start gap-3 p-4 bg-ark-accent-green/5 border border-ark-accent-green/15 rounded-xl">
        <CheckCircle2 className="w-4 h-4 text-ark-accent-green shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-medium text-content-primary">Your data stays private</p>
          <p className="text-xs text-content-secondary mt-0.5">
            Local AI processes everything on your computer. No data is sent to the cloud when using local models.
          </p>
        </div>
      </div>
    </div>
  );
}

function StatusItem({ label, value, color }: { label: string; value: string; color: 'green' | 'blue' | 'primary' | 'tertiary' }) {
  const colors = {
    green: 'text-ark-accent-green',
    blue: 'text-ark-blue-300',
    primary: 'text-content-primary',
    tertiary: 'text-content-tertiary',
  };
  return (
    <div className="bg-ark-navy-900 border border-surface-border rounded-lg p-3">
      <p className="text-2xs uppercase tracking-wider text-content-tertiary mb-0.5">{label}</p>
      <p className={`text-sm font-medium truncate ${colors[color]}`}>{value}</p>
    </div>
  );
}

function AdvancedRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-content-secondary">{label}</span>
      <span className="text-xs font-mono text-content-primary">{value}</span>
    </div>
  );
}
