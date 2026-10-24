import { ToolsHomeShell } from '@/components/ToolsHomeShell';

/** Schedules & tool utilities — baked into create / chat, not a switch wall. */
export function AutomationsView() {
  return (
    <ToolsHomeShell
      title="Automations"
      summary="Verify, MCP, and scheduled helpers run as part of Nova. Nothing here needs turning on."
    >
      <p className="text-[13px] text-content-secondary leading-relaxed rounded-xl border border-stroke-subtle/70 bg-surface-hover/20 px-4 py-3">
        Create and chat already run verify steps, installs, and tool loops for you.
        Use this page as a quiet home for upcoming schedules — no research toggles.
      </p>
    </ToolsHomeShell>
  );
}
