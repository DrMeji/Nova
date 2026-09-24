/** Small profile / contact avatar — always the NOVA mark (no photos, no initials). */

import { NovaMark } from '@/components/NovaMark';

const SIZE: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-7 w-7',
  md: 'h-9 w-9',
  lg: 'h-10 w-10',
};

const MARK: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4.5 h-4.5',
  lg: 'w-5 h-5',
};

export function NovaAvatar({
  name,
  src: _src,
  size = 'md',
  className = '',
}: {
  name: string;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const dim = SIZE[size];
  const mark = MARK[size];
  return (
    <span
      className={`${dim} flex items-center justify-center shrink-0 ${className}`}
      title={name || 'NOVA'}
      aria-label={name || 'NOVA'}
    >
      <NovaMark className={`${mark} text-content-primary`} title={name || 'NOVA'} />
    </span>
  );
}
