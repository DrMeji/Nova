import { HomeControlsPanel } from '@/components/HomeControlsPanel';
import { ToolsHomeShell } from '@/components/ToolsHomeShell';

/** Scheduled jobs & Tools utilities — layout matches Plugins / Models. */
export function AutomationsView() {
  return (
    <ToolsHomeShell
      title="Automations"
      summary="Verify, MCP, schedules, and related Nova tools. Open a suite to see what’s active."
    >
      <HomeControlsPanel home="nav-tools" peerBoxes defaultOn />
    </ToolsHomeShell>
  );
}
