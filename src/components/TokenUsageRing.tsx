/** Circular token-budget indicator — fills as the active model’s session budget is used. */

type Props = {
  /** 0–1 */
  ratio: number;
  size?: number;
  className?: string;
  title?: string;
};

export function TokenUsageRing({
  ratio,
  size = 18,
  className = '',
  title,
}: Props) {
  const r = Math.max(0, Math.min(1, ratio));
  const stroke = 2.25;
  const radius = (size - stroke) / 2;
  const c = 2 * Math.PI * radius;
  const dash = c * r;
  const pct = Math.round(r * 100);

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 ${className}`}
      title={title || `Token usage · ${pct}% of this model’s turn budget`}
      aria-label={`Token usage ${pct} percent`}
      role="img"
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-white/15"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          className={r > 0.85 ? 'text-amber-300' : 'text-white/90'}
        />
      </svg>
    </span>
  );
}
