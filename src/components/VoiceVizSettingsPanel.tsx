import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import {
  getVoiceVizPrefs,
  setVoiceVizPrefs,
  resetVoiceVizPrefs,
  VOICE_VIZ_CHANGED,
  type VoiceVizPrefs,
  type VoiceOrbitMode,
  type VoiceColorMode,
} from '@/lib/voiceVizPrefs';

type SliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
};

function Slider({ label, value, min, max, step = 0.05, onChange }: SliderProps) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="flex items-center justify-between gap-2 text-[10px] text-content-tertiary">
        <span>{label}</span>
        <span className="tabular-nums text-content-secondary">{value.toFixed(2)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-sky-400 h-1.5 cursor-pointer"
      />
    </label>
  );
}

const ORBIT_OPTIONS: Array<{ id: VoiceOrbitMode; label: string }> = [
  { id: 'both', label: 'Both ways' },
  { id: 'cw', label: 'Clockwise' },
  { id: 'ccw', label: 'Counter' },
  { id: 'none', label: 'Freeze' },
];

const COLOR_OPTIONS: Array<{ id: VoiceColorMode; label: string }> = [
  { id: 'full', label: 'Full RGB' },
  { id: 'warm', label: 'Warm' },
  { id: 'cool', label: 'Cool' },
  { id: 'neon', label: 'Neon' },
];

/**
 * Voice ring visualization controls — lives in Settings → Voice.
 * Same knobs the Voice lab used; values persist on this PC.
 */
export function VoiceVizSettingsPanel() {
  const [prefs, setPrefs] = useState<VoiceVizPrefs>(() => getVoiceVizPrefs());

  useEffect(() => {
    const onChange = (ev: Event) => {
      const detail = (ev as CustomEvent<VoiceVizPrefs>).detail;
      if (detail) setPrefs(detail);
      else setPrefs(getVoiceVizPrefs());
    };
    window.addEventListener(VOICE_VIZ_CHANGED, onChange);
    return () => window.removeEventListener(VOICE_VIZ_CHANGED, onChange);
  }, []);

  const patch = (partial: Partial<VoiceVizPrefs>) => {
    setPrefs(setVoiceVizPrefs(partial));
  };

  return (
    <div className="rounded-xl border border-surface-border bg-nova-navy-900/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-content-primary">Ring visualization</p>
          <p className="text-[11px] text-content-tertiary mt-0.5 leading-snug">
            Motion, equalizer, thinking ripple, colors, and float-away for the Voice sphere.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPrefs(resetVoiceVizPrefs())}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-content-tertiary hover:text-content-secondary shrink-0"
          title="Reset to locked defaults"
        >
          <RotateCcw className="w-3 h-3" />
          Reset
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
        <Slider label="Idle speed" value={prefs.idleSpeed} min={0.05} max={2.5} onChange={(n) => patch({ idleSpeed: n })} />
        <Slider label="Thinking speed" value={prefs.thinkSpeed} min={0.05} max={2.5} onChange={(n) => patch({ thinkSpeed: n })} />
        <Slider label="Speaking speed" value={prefs.speakSpeed} min={0.05} max={2.5} onChange={(n) => patch({ speakSpeed: n })} />
        <Slider label="Equalizer strength" value={prefs.eqStrength} min={0} max={2.5} onChange={(n) => patch({ eqStrength: n })} />
        <Slider label="Equalizer speed" value={prefs.eqSpeed} min={0.1} max={2.5} onChange={(n) => patch({ eqSpeed: n })} />
        <Slider label="Breathe" value={prefs.breathe} min={0} max={2.5} onChange={(n) => patch({ breathe: n })} />
        <Slider label="Density" value={prefs.density} min={0.35} max={1.6} onChange={(n) => patch({ density: n })} />
        <Slider label="Brightness" value={prefs.brightness} min={0.4} max={1.8} onChange={(n) => patch({ brightness: n })} />
        <Slider
          label="Float strength"
          value={prefs.floatStrength}
          min={0}
          max={2}
          onChange={(n) => patch({ floatStrength: n })}
        />
        <Slider
          label="Ripple interval (thinking)"
          value={prefs.rippleIntervalMs / 1000}
          min={0.4}
          max={4}
          step={0.1}
          onChange={(n) => patch({ rippleIntervalMs: Math.round(n * 1000) })}
        />
        <Slider
          label="Ripple travel (thinking)"
          value={prefs.rippleDurationMs / 1000}
          min={0.4}
          max={3.5}
          step={0.1}
          onChange={(n) => patch({ rippleDurationMs: Math.round(n * 1000) })}
        />
        <Slider
          label="Ripple strength (thinking)"
          value={prefs.rippleStrength}
          min={0}
          max={2}
          onChange={(n) => patch({ rippleStrength: n })}
        />
      </div>

      <p className="text-[10px] text-content-tertiary leading-snug">
        Ripple only runs while NOVA is thinking (fetching an answer). Idle and speaking stay calm.
      </p>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="text-[10px] text-content-tertiary w-full sm:w-auto">Orbit</span>
        {ORBIT_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => patch({ orbitMode: opt.id })}
            className={`rounded-full px-2.5 py-0.5 text-[10px] border transition-colors ${
              prefs.orbitMode === opt.id
                ? 'border-sky-500/50 bg-sky-500/15 text-sky-100'
                : 'border-surface-border text-content-tertiary hover:text-content-secondary'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] text-content-tertiary w-full sm:w-auto">Colors</span>
        {COLOR_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => patch({ colorMode: opt.id })}
            className={`rounded-full px-2.5 py-0.5 text-[10px] border transition-colors ${
              prefs.colorMode === opt.id
                ? 'border-sky-500/50 bg-sky-500/15 text-sky-100'
                : 'border-surface-border text-content-tertiary hover:text-content-secondary'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <label className="flex items-center gap-2 text-[11px] text-content-secondary cursor-pointer select-none">
        <input
          type="checkbox"
          checked={prefs.floatAway}
          onChange={(e) => patch({ floatAway: e.target.checked })}
          className="rounded border-surface-border accent-sky-400"
        />
        Float-away pixels
      </label>
    </div>
  );
}
