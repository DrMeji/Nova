import { HomeControlsPanel } from '@/components/HomeControlsPanel';
import { ToolsHomeShell } from '@/components/ToolsHomeShell';

/** Outside services — layout matches Plugins / Models. */
export function IntegrationsView() {
  return (
    <ToolsHomeShell
      title="Integrations"
      summary="Service links Nova can use (GitHub, Figma, payments…). Keys stay in Settings → Providers. Open a suite to see what’s active."
    >
      <HomeControlsPanel home="settings-providers" peerBoxes defaultOn />
    </ToolsHomeShell>
  );
}
