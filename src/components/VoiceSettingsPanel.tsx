import { useCallback, useEffect, useState } from 'react';
import { Mic, Volume2, RefreshCw } from 'lucide-react';
import { getLocalPrefs, setLocalPrefs } from '@/lib/localPrefs';
import { isNovaDevSession } from '@/lib/novaRuntime';
import { isVoiceTabEnabled } from '@/lib/voiceMode';
import {
  VOICE_DEVICE_AUTO,
  VOICE_TTS_CHOICES,
  VOICE_TTS_FEMALE_ID,
  formatDeviceOptionLabel,
  listAudioDevices,
  playOutputTestTone,
  syncAutoVoiceDevices,
  testMicrophoneInput,
  type AudioDeviceOption,
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
  const [prefs, setPrefs] = useState(() => getLocalPrefs());
  const [devices, setDevices] = useState<AudioDeviceOption[]>([]);
  const [neuralTts, setNeuralTts] = useState(false);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [status, setStatus] = useState('');
  const [testingMic, setTestingMic] = useState(false);
  const [testingSpeaker, setTestingSpeaker] = useState(false);
  const [autoLabels, setAutoLabels] = useState<{ input?: string; output?: string }>({});

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
    const loadVoices = async () => {
      if (window.novaDesktop?.voiceNeuralVoices) {
        const res = await window.novaDesktop.voiceNeuralVoices();
        setNeuralTts(Boolean(res?.ok && res.voices?.length));
      } else {
        setNeuralTts(false);
      }
    };
    void loadVoices();
    const onAudio = () => setPrefs(getLocalPrefs());
    window.addEventListener('NOVA:voice-audio-changed', onAudio);
    navigator.mediaDevices?.addEventListener?.('devicechange', refreshDevices);
    return () => {
      window.removeEventListener('NOVA:voice-audio-changed', onAudio);
      navigator.mediaDevices?.removeEventListener?.('devicechange', refreshDevices);
    };
  }, [refreshDevices]);

  const patch = (patch: Partial<typeof prefs>) => {
    const next = setLocalPrefs(patch);
    setPrefs(next);
    onSaved?.('Saved on this device');
  };

  const inputs = dedupeDevices(devices.filter(d => d.kind === 'audioinput' && d.deviceId !== 'default'));
  const outputs = dedupeDevices(devices.filter(d => d.kind === 'audiooutput' && d.deviceId !== 'default'));

  const runMicTest = async () => {
    setTestingMic(true);
    setStatus('');
    const result = await testMicrophoneInput();
    setTestingMic(false);
    setStatus(result.ok ? 'Microphone is working.' : (result.error || 'Microphone test failed.'));
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
          {testingMic ? 'Testing…' : 'Test microphone'}
        </button>
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
