import { Download, Loader2, X } from 'lucide-react';
import { modelPurposeText } from '@/lib/modelPurpose';

export function ModelDownloadConfirm({
  name,
  sizeLabel,
  category,
  detail,
  busy,
  onCancel,
  onConfirm,
}: {
  name: string;
  sizeLabel?: string;
  category?: string;
  detail?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const purpose = modelPurposeText({ category, name, detail });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ark-navy-950/70 backdrop-blur-md"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-surface-border bg-ark-navy-900 p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-content-primary">Download {name}?</h2>
            {sizeLabel ? (
              <p className="text-xs text-content-tertiary mt-1 tabular-nums">{sizeLabel}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-content-tertiary hover:text-content-primary hover:bg-surface-hover"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-2 mt-6">
          <button type="button" onClick={onCancel} className="ark-btn-secondary flex-1" disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="ark-btn-primary flex-1 disabled:opacity-40 inline-flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {busy ? 'Starting…' : 'Download'}
          </button>
        </div>
      </div>
    </div>
  );
}
