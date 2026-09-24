import { AlertTriangle, CheckCircle2, Download, Loader2, Sparkles, X } from 'lucide-react';
import { modelPurposeText } from '@/lib/modelPurpose';
import type { ModelFitAssessment, SimilarModelPick } from '@/lib/modelCompat';
import { modelDownloadConfirmCopy } from '@/lib/modelCompat';

export function ModelDownloadConfirm({
  name,
  sizeLabel,
  category,
  detail,
  fit,
  recommended,
  busy,
  onCancel,
  onConfirm,
  onConfirmRecommended,
}: {
  name: string;
  sizeLabel?: string;
  category?: string;
  detail?: string;
  fit?: ModelFitAssessment | null;
  recommended?: SimilarModelPick | null;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onConfirmRecommended?: () => void;
}) {
  const purpose = modelPurposeText({ category, name, detail });
  const copy = fit
    ? modelDownloadConfirmCopy(fit)
    : { title: 'Confirm download', primaryLabel: 'Download', secondaryLabel: 'Cancel' };
  const level = fit?.level || 'good';
  const tone =
    level === 'good'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
      : level === 'stretch'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-50'
        : 'border-rose-500/30 bg-rose-500/10 text-rose-50';
  const Icon = level === 'good' ? CheckCircle2 : AlertTriangle;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-nova-navy-950/70 backdrop-blur-md"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-surface-border bg-nova-navy-900 p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-content-primary">{copy.title}</h2>
            <p className="text-sm text-content-secondary mt-1 truncate">
              {name}
              {sizeLabel ? <span className="text-content-tertiary"> · {sizeLabel}</span> : null}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-content-tertiary hover:text-content-primary hover:bg-surface-hover shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {fit ? (
          <div className={`rounded-xl border px-3.5 py-3 mb-4 ${tone}`}>
            <div className="flex items-start gap-2.5">
              <Icon className="w-4 h-4 mt-0.5 shrink-0 opacity-90" />
              <div className="min-w-0">
                <p className="text-sm font-medium leading-snug">{fit.headline}</p>
                <p className="text-xs mt-1.5 leading-relaxed opacity-90">{fit.body}</p>
              </div>
            </div>
          </div>
        ) : null}

        <p className="text-xs text-content-tertiary leading-relaxed mb-4">{purpose}</p>

        {recommended && level !== 'good' ? (
          <div className="rounded-xl border border-sky-500/25 bg-sky-500/10 px-3.5 py-3 mb-5">
            <div className="flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 mt-0.5 shrink-0 text-sky-300" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-sky-100">Recommended for this PC</p>
                <p className="text-xs text-sky-100/85 mt-1 leading-relaxed">
                  {recommended.name}
                  <span className="text-sky-200/70"> · {recommended.sizeLabel}</span>
                  {' — '}
                  {recommended.reason}
                </p>
                {onConfirmRecommended ? (
                  <button
                    type="button"
                    onClick={onConfirmRecommended}
                    disabled={busy}
                    className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500/90 hover:bg-sky-400 text-nova-navy-950 text-sm font-semibold px-3 py-2.5 transition-colors disabled:opacity-40"
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    {busy ? 'Starting…' : `Download ${recommended.name}`}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="nova-btn-secondary flex-1" disabled={busy}>
            {copy.secondaryLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`flex-1 disabled:opacity-40 inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
              level === 'good'
                ? 'nova-btn-primary'
                : 'border border-surface-border bg-surface-hover/60 text-content-primary hover:bg-surface-hover'
            }`}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {busy ? 'Starting…' : copy.primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
