import type { ReactNode } from 'react';

/** Equal outer padding so the panel clears window controls (top = bottom). */
const PAD = 'p-4';

/** One card for people list + chat (Message). */
export function ConnectShell({
  railVisible,
  railCompact,
  railWidthClass,
  rail,
  children,
}: {
  railVisible: boolean;
  railCompact?: boolean;
  railWidthClass?: string;
  rail: ReactNode;
  children: ReactNode;
}) {
  const width = railWidthClass
    || (railCompact ? 'w-[4.25rem]' : 'w-64');

  return (
    <div className={`h-full box-border ${PAD} animate-fade-in bg-ark-navy-950`}>
      <div className="h-full min-h-0 flex rounded-2xl border border-surface-border bg-ark-navy-900/55 shadow-[0_8px_32px_rgba(0,0,0,0.35)] overflow-hidden">
        {railVisible && (
          <aside
            className={`shrink-0 flex flex-col min-h-0 border-r border-white/5 bg-ark-navy-950/25 transition-[width] duration-200 ${width}`}
          >
            {rail}
          </aside>
        )}
        <div className="flex-1 min-w-0 flex flex-col min-h-0 bg-ark-navy-950/20">
          {children}
        </div>
      </div>
    </div>
  );
}
