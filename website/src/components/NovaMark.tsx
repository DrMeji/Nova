/** NOVA circuit-tree mark — exact glyph from brand art. */
const MARK_SRC = '/nova-mark-glyph.png';

export function NovaMark({
  size = 32,
  className = '',
  animated = false,
}: {
  size?: number;
  className?: string;
  animated?: boolean;
}) {
  const cls = animated ? `nova-mark nova-mark-animated ${className}`.trim() : className;
  return (
    <span
      aria-hidden
      className={`inline-block bg-current ${cls}`}
      style={{
        width: size,
        height: size,
        WebkitMaskImage: `url(${MARK_SRC})`,
        maskImage: `url(${MARK_SRC})`,
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
      }}
    />
  );
}
