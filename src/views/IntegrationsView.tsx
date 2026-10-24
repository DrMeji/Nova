import { ToolsHomeShell } from '@/components/ToolsHomeShell';

/** Outside services — built-in; keys live in Settings → Providers. */
export function IntegrationsView() {
  return (
    <ToolsHomeShell
      title="Integrations"
      summary="GitHub, Figma, Discord, and other service links are part of Nova. Add API keys in Settings → Providers — no helper switches to flip."
    >
      <p className="text-[13px] text-content-secondary leading-relaxed rounded-xl border border-stroke-subtle/70 bg-surface-hover/20 px-4 py-3">
        Integrations are on by default when you connect a key. Open{' '}
        <span className="text-content-primary font-medium">Settings → Providers</span>
        {' '}to paste tokens. Chat and create use them automatically.
      </p>
    </ToolsHomeShell>
  );
}
