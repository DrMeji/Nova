import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Volume2, RefreshCw, KeyRound, Download } from 'lucide-react';
import { getLocalPrefs, setLocalPrefs } from '@/lib/localPrefs';
import { isNovaDevSession } from '@/lib/novaRuntime';
import { isVoiceTabEnabled } from '@/lib/voiceMode';
import { probeLiveCapacity, type LiveCapacity } from '@/lib/novaCapacity';
import { VoiceVizSettingsPanel } from '@/components/VoiceVizSettingsPanel';
import { useRouter } from '@/context/RouterContext';
import {
  VOICE_DEVICE_AUTO,
  VOICE_TTS_CHOICES,
  VOICE_TTS_FEMALE_ID,
  formatDeviceOptionLabel,
  listAudioDevices,
  playOutputTestTone,
  syncAutoVoiceDevices,
  startMicrophoneLevelMonitor,
  type AudioDeviceOption,
  type MicLevelHandle,
} from '@/lib/voiceAudio';

const SELECT_CLASS =
  'w-full rounded-lg border border-surface-border bg-nova-navy-800/80 px-3 py-2.5 text-xs text-content-primary focus:outline-none focus:ring-1 focus:ring-sky-500/40';

type VoiceSettingsPanelProps = {
  onSaved?: (msg: string) => void;
};

function dedupeDevices(devices: AudioDeviceOption[]): AudioDeviceOption[] {
  const seen = new Set<string>();
  return devices.filter(d => {
    const key = `${d.kind}:${formatDeviceOptionLabel(d.label)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function VoiceSettingsPanel({ onSaved }: VoiceSettingsPanelProps) {
  const { navigate } = useRouter();
  const [prefs, setPrefs] = useState(() => getLocalPrefs());
  const [devices, setDevices] = useState<AudioDeviceOption[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [status, setStatus] = useState('');
  const [testingMic, setTestingMic] = useState(false);
  const [testingSpeaker, setTestingSpeaker] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [micMeterActive, setMicMeterActive] = useState(false);
  const micMonitorRef = useRef<MicLevelHandle | null>(null);
  const micStopTimerRef = useRef(0);
  const micPeakRef = useRef(0);
  const [autoLabels, setAutoLabels] = useState<{ input?: string; output?: string }>({});
  const [capacity, setCapacity] = useState<LiveCapacity | null>(null);

  const stopMicMonitor = useCallback(() => {
    window.clearTimeout(micStopTimerRef.current);
    micMonitorRef.current?.stop();
    micMonitorRef.current = null;
    setMicMeterActive(false);
    setMicLevel(0);
    setTestingMic(false);
  }, []);

  const refreshDevices = useCallback(async () => {
    setLoadingDevices(true);
    const list = await listAudioDevices();
    setDevices(list);
    const detected = await syncAutoVoiceDevices();
    setAutoLabels({ input: detected.inputLabel, output: detected.outputLabel });
    setPrefs(getLocalPrefs());
    setLoadingDevices(false);
  }, []);

  useEffect(() => {
    void refreshDevices();
    void probeLiveCapacity().then(setCapacity).catch(() => setCapacity(null));
    const onAudio = () => setPrefs(getLocalPrefs());
    window.addEventListener('NOVA:voice-audio-changed', onAudio);
    navigator.mediaDevices?.addEventListener?.('devicechange', refreshDevices);
    return () => {
      window.removeEventListener('NOVA:voice-audio-changed', onAudio);
      navigator.mediaDevices?.removeEventListener?.('devicechange', refreshDevices);
      stopMicMonitor();
    };
  }, [refreshDevices, stopMicMonitor]);

  const patch = (nextPatch: Partial<typeof prefs>) => {
    const next = setLocalPrefs(nextPatch);
    setPrefs(next);
    onSaved?.('Saved on this device');
  };

  const inputs = dedupeDevices(devices.filter(d => d.kind === 'audioinput' && d.deviceId !== 'default'));
  const outputs = dedupeDevices(devices.filter(d => d.kind === 'audiooutput' && d.deviceId !== 'default'));

  const runMicTest = async () => {
    if (micMeterActive) {
      stopMicMonitor();
      setStatus('Microphone test stopped.');
      return;
    }
    setTestingMic(true);
    setStatus('');
    setMicLevel(0);
    micPeakRef.current = 0;
    const result = await startMicrophoneLevelMonitor(level => {
      if (level > micPeakRef.current) micPeakRef.current = level;
      setMicLevel(level);
    });
    if (!result.ok) {
      setTestingMic(false);
      setStatus(result.error || 'Microphone test failed.');
      return;
    }
    micMonitorRef.current = result.handle;
    setMicMeterActive(true);
    setTestingMic(false);
    setStatus('Speak into the mic — the green bar should move. Listening for 8 seconds…');
    micStopTimerRef.current = window.setTimeout(() => {
      const peak = micPeakRef.current;
      stopMicMonitor();
      setStatus(
        peak > 0.05
          ? 'Microphone is working. If Voice still can’t hear you, try Auto-detect or re-select the HyperX.'
          : 'Opened the mic, but little signal was heard. Check Windows input level / mute on the HyperX.',
      );
    }, 8000);
  };

  const runSpeakerTest = async () => {
    setTestingSpeaker(true);
    setStatus('');
    const result = await playOutputTestTone();
    setTestingSpeaker(false);
    setStatus(result.ok ? 'Played test tone on selected output.' : (result.error || 'Speaker test failed.'));
  };

  const voiceLive = isVoiceTabEnabled();
  const autoInputLabel = autoLabels.input ? `Auto: ${autoLabels.input}` : 'Auto-detect microphone';
  const autoOutputLabel = autoLabels.output ? `Auto: ${autoLabels.output}` : 'Auto-detect headphones / speakers';
  const spokenVoice = prefs.voiceTtsVoiceUri === VOICE_TTS_CHOICES[1].id
    ? VOICE_TTS_CHOICES[1].id
    : VOICE_TTS_FEMALE_ID;

  return (
    <div className="space-y-4 pb-20">
      {isNovaDevSession() && (
        <div className="rounded-xl border border-sky-500/25 bg-sky-500/10 p-3 text-xs text-sky-100/90">
          Dev build · Voice tab always on
        </div>
      )}

      <div className="rounded-xl border border-surface-border bg-nova-navy-900/40 p-4 space-y-3">
        <p className="text-sm font-medium text-content-primary">Voice chat</p>
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-content-primary">Enable Voice tab in Chat</p>
          <button
            type="button"
            disabled={isNovaDevSession()}
            onClick={() => patch({ voiceChatEnabled: !prefs.voiceChatEnabled })}
            className={`relative rounded-full transition-colors shrink-0 ${prefs.voiceChatEnabled || isNovaDevSession() ? 'bg-content-primary' : 'bg-nova-navy-700'} ${isNovaDevSession() ? 'opacity-70' : ''}`}
            style={{ height: '22px', width: '40px' }}
            aria-pressed={voiceLive}
            title={isNovaDevSession() ? 'Always on in dev builds' : undefined}
          >
            <div
              className={`absolute top-0.5 bg-white rounded-full transition-transform ${voiceLive ? 'translate-x-5' : 'translate-x-0.5'}`}
              style={{ width: '18px', height: '18px' }}
            />
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-surface-border bg-nova-navy-900/40 p-4 space-y-3">
        <p className="text-sm font-medium text-content-primary flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-content-secondary" />
          Brain for Voice
        </p>
        <p className="text-[12px] text-content-secondary leading-relaxed">
          Voice uses the same chat brain as Chat — a free cloud API key or a local model. Speech (mic + spoken replies) is built in; you don’t install a separate “voice model.”
        </p>
        {capacity ? (
          <p className={`text-[12px] ${capacity.liveChat ? 'text-emerald-300/90' : 'text-amber-200/90'}`}>
            {capacity.summary}
          </p>
        ) : (
          <p className="text-[12px] text-content-tertiary">Checking brain capacity…</p>
        )}
        {capacity && !capacity.liveChat ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="nova-btn-secondary text-xs inline-flex items-center gap-1.5"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('NOVA:open-settings', { detail: { section: 'providers' } }));
              }}
            >
              <KeyRound className="w-3.5 h-3.5" />
              Connect free API key
            </button>
            <button
              type="button"
              className="nova-btn-secondary text-xs inline-flex items-center gap-1.5"
              onClick={() => navigate({ name: 'models', tab: 'for-pc' })}
            >
              <Download className="w-3.5 h-3.5" />
              Install local brain
            </button>
          </div>
        ) : null}
        {capacity?.suggestedFreeKeys?.length && !capacity.liveChat ? (
          <p className="text-[11px] text-content-tertiary">
            Easy free keys: {capacity.suggestedFreeKeys.map(k => k.name).join(', ')}
          </p>
        ) : null}
      </div>

      <VoiceVizSettingsPanel />

      <div className="rounded-xl border border-surface-border bg-nova-navy-900/40 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-content-primary flex items-center gap-2">
            <Mic className="w-4 h-4 text-content-secondary" />
            Microphone
          </p>
          <button
            type="button"
            className="nova-btn-secondary text-[10px] !px-2 !py-1"
            onClick={() => void refreshDevices()}
            disabled={loadingDevices}
            title="Refresh devices"
          >
            <RefreshCw className={`w-3 h-3 ${loadingDevices ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <select
          value={prefs.voiceInputAuto ? VOICE_DEVICE_AUTO : (prefs.voiceInputDeviceId || '')}
          onChange={e => {
            const v = e.target.value;
            if (v === VOICE_DEVICE_AUTO) {
              patch({ voiceInputAuto: true });
              void refreshDevices();
            } else {
              patch({ voiceInputAuto: false, voiceInputDeviceId: v || undefined });
            }
          }}
          className={SELECT_CLASS}
        >
          <option value={VOICE_DEVICE_AUTO}>{autoInputLabel}</option>
          {inputs.map(d => (
            <option key={d.deviceId} value={d.deviceId}>
              {formatDeviceOptionLabel(d.label)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="nova-btn-secondary text-xs"
          onClick={() => void runMicTest()}
          disabled={testingMic}
        >
          {micMeterActive ? 'Stop test' : testingMic ? 'Opening…' : 'Test microphone'}
        </button>
        {micMeterActive || micLevel > 0.01 ? (
          <div className="space-y-1.5" aria-live="polite">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-content-tertiary">
              <span>Input level</span>
              <span className="tabular-nums">{Math.round(micLevel * 100)}%</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-nova-navy-950/80 border border-surface-border overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-400 transition-[width] duration-75 ease-out"
                style={{ width: `${Math.max(2, Math.round(micLevel * 100))}%` }}
              />
            </div>
            <p className="text-[11px] text-content-tertiary">
              Talk normally — the green bar should rise with your voice.
            </p>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-surface-border bg-nova-navy-900/40 p-4 space-y-3">
        <p className="text-sm font-medium text-content-primary flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-content-secondary" />
          Headphones / speakers
        </p>
        <select
          value={prefs.voiceOutputAuto ? VOICE_DEVICE_AUTO : (prefs.voiceOutputDeviceId || '')}
          onChange={e => {
            const v = e.target.value;
            if (v === VOICE_DEVICE_AUTO) {
              patch({ voiceOutputAuto: true });
              void refreshDevices();
            } else {
              patch({ voiceOutputAuto: false, voiceOutputDeviceId: v || undefined });
            }
          }}
          className={SELECT_CLASS}
        >
          <option value={VOICE_DEVICE_AUTO}>{autoOutputLabel}</option>
          {outputs.map(d => (
            <option key={d.deviceId} value={d.deviceId}>
              {formatDeviceOptionLabel(d.label)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="nova-btn-secondary text-xs"
          onClick={() => void runSpeakerTest()}
          disabled={testingSpeaker}
        >
          {testingSpeaker ? 'Playing…' : 'Test sound'}
        </button>
      </div>

      <div className="rounded-xl border border-surface-border bg-nova-navy-900/40 p-4 space-y-3">
        <p className="text-sm font-medium text-content-primary">Spoken voice</p>
        <select
          value={spokenVoice}
          onChange={e => patch({ voiceTtsVoiceUri: e.target.value })}
          className={SELECT_CLASS}
        >
          {VOICE_TTS_CHOICES.map(v => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
      </div>

      {status ? (
        <p className="text-xs text-content-secondary rounded-lg border border-surface-border bg-nova-navy-900/50 px-3 py-2">{status}</p>
      ) : null}
    </div>
  );
}
