import type { FileVerifyResult } from '@/lib/codingFileVerify';

export function FileVerifyChips({ results }: { results: FileVerifyResult[] }) {
  if (!results?.length) return null;
  return (
    <ul className="flex flex-wrap gap-1" data-nova-file-verify-chips="1" aria-label="Per-file verify pass fail">
      {results.map((r) => (
        <li
          key={r.path}
          className={
            r.ok
              ? 'text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
              : 'text-[10px] px-1.5 py-0.5 rounded border border-rose-500/40 bg-rose-500/10 text-rose-100'
          }
          title={r.reasons.join('; ') || 'ok'}
        >
          {r.ok ? '✓' : '✗'} {r.path.split('/').pop()} · {r.premiumScore}
        </li>
      ))}
    </ul>
  );
}

export function PremiumQualityChip({ score }: { score: number }) {
  return (
    <span
      className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded border border-violet-400/40 bg-violet-500/10 text-violet-100"
      data-nova-premium-quality-chip="1"
    >
      Premium {score}/100
    </span>
  );
}
