import { ToolsHomeShell } from '@/components/ToolsHomeShell';

/**
 * Test device — shell for future VM integration (VirtualBox / Hyper-V / UTM).
 * Parked in the sidebar until invent is solid; then we wire real boots.
 */
export function TestDeviceView() {
  return (
    <ToolsHomeShell
      title="Test device"
      summary="Pick Windows or Linux and try your invent project in a sandbox. Uses existing VM apps — not a custom hypervisor. Coming after coding invent is reliable."
    >
      <div className="rounded-xl border border-surface-border px-4 py-6 text-sm text-content-secondary leading-relaxed">
        <p className="font-medium text-content-primary">Parked for now</p>
        <p className="mt-2">
          Next: detect VirtualBox / Hyper-V / UTM, offer guest OS, mount the project, boot.
          Remote Nova-hosted models stay an internal roadmap item — not shown here.
        </p>
      </div>
    </ToolsHomeShell>
  );
}
