type EngineStatusLite = {
  phase?: string;
  note?: string;
  ggufBinary?: boolean;
} | null;

export function SettingsSystemHealth(props: {
  engineStatus: EngineStatusLite;
  brainUrl: string;
  diskFreeGb?: number | null;
}) {
  const { engineStatus, brainUrl, diskFreeGb } = props;
  return (
    <div className="rounded-xl border border-surface-border p-4 space-y-2">
      <p className="text-sm font-medium text-content-primary">System health</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
        <span className="text-content-tertiary">Engine</span>
        <span className="text-content-primary">{engineStatus?.phase ?? 'unknown'} · {engineStatus?.note ?? '—'}</span>
        <span className="text-content-tertiary">Brain URL</span>
        <span className="text-content-primary font-mono truncate">{brainUrl || '—'}</span>
        <span className="text-content-tertiary">Free disk</span>
        <span className="text-content-primary">
          {typeof diskFreeGb === 'number' ? `${diskFreeGb.toFixed(1)} GB` : 'Unknown'}
        </span>
        <span className="text-content-tertiary">GGUF runtime</span>
        <span className="text-content-primary">{engineStatus?.ggufBinary ? 'Ready' : 'Not installed'}</span>
      </div>
      <button
        type="button"
        className="nova-btn-secondary text-xs mt-1"
        onClick={() => void window.novaDesktop?.localReportsOpen?.()}
      >
        Open local reports
      </button>
    </div>
  );
}
