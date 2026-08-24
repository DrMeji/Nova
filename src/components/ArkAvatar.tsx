/** Small profile / contact avatar — photo when set, else initials. */

function initials(name: string) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

const SIZE: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-7 w-7 text-[9px]',
  md: 'h-9 w-9 text-[11px]',
  lg: 'h-10 w-10 text-xs',
};

export function ArkAvatar({
  name,
  src,
  size = 'md',
  className = '',
}: {
  name: string;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const dim = SIZE[size];
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={`${dim} rounded-full object-cover border border-white/10 shrink-0 ${className}`}
      />
    );
  }
  return (
    <span
      className={`${dim} rounded-full bg-white/5 border border-white/10 flex items-center justify-center font-semibold text-content-primary shrink-0 ${className}`}
    >
      {initials(name)}
    </span>
  );
}
