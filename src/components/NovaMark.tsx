/** NOVA circuit-tree mark — exact glyph from brand art (mask keeps currentColor). */
const MARK_SRC = `${import.meta.env.BASE_URL}nova-mark-glyph.png`;

export function NovaMark({
  className = 'w-7 h-7',
  title = 'NOVA',
}: {
  className?: string;
  title?: string;
}) {
  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      className={`inline-block shrink-0 object-contain bg-current ${className}`}
      style={{
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
