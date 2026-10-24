/**
 * Page chrome for Agents / Automations / Integrations — same rhythm as Plugins & Models.
 */
import type { ReactNode } from 'react';

export function ToolsHomeShell({
  title,
  summary,
  children,
}: {
  title: string;
  summary?: string;
  children: ReactNode;
}) {
  return (
    <div className="h-full min-w-0 flex flex-col overflow-hidden animate-fade-in bg-transparent text-content-primary">
      <div className="shrink-0 px-4 sm:px-6 pt-[min(12vh,6rem)] bg-transparent">
        <div className="w-full max-w-4xl mx-auto min-w-0">
          <h1 className="text-2xl sm:text-3xl font-semibold text-content-primary tracking-tight">
            {title}
          </h1>
          {summary ? (
            <p className="mt-2 text-sm text-content-secondary leading-relaxed max-w-2xl">
              {summary}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden px-4 sm:px-6 pb-10">
        <div className="w-full max-w-4xl mx-auto min-w-0">
          {children}
        </div>
      </div>
    </div>
  );
}
