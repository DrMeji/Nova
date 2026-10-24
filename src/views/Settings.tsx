import { SettingsContent } from '@/components/SettingsContent';
import { useRouter } from '@/context/RouterContext';

/** Full-page settings from the sidebar Settings tab. */
export function Settings() {
  const { route } = useRouter();
  const section = route.name === 'settings' ? route.section : undefined;
  return (
    <div className="h-full min-w-0 overflow-hidden bg-nova-navy-900">
      <SettingsContent initialSection={section} />
    </div>
  );
}
