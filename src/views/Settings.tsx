import { SettingsContent } from '@/components/SettingsContent';

/** Full-page settings — same panel as the sidebar overlay. */
export function Settings() {
  return (
    <div className="h-full overflow-hidden bg-ark-navy-950">
      <SettingsContent />
    </div>
  );
}
