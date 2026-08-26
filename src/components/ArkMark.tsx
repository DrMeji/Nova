/** Bare ARK robot mark — no rounded box / plate behind it. */
export function ArkMark({
  className = 'w-7 h-7',
  title = 'ARK',
}: {
  className?: string;
  title?: string;
}) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}ark-icon.png`}
      alt=""
      title={title}
      className={`object-contain shrink-0 ${className}`}
      draggable={false}
      onError={e => {
        (e.currentTarget as HTMLImageElement).style.display = 'none';
      }}
    />
  );
}
