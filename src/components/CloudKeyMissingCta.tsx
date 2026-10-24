import { cloudKeyMissingMessage } from '@/lib/codingProvidersTestConnection';

/** CTA when cloud key missing — opens Settings → Providers. */
export function CloudKeyMissingCta({ onOpenProviders }: { onOpenProviders?: () => void }) {
  return (
    <div
      className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-[12px] text-content-primary"
      data-nova-cloud-key-cta="1"
      role="status"
    >
      <p className="leading-snug">{cloudKeyMissingMessage()}</p>
      {onOpenProviders ? (
        <button
          type="button"
          className="mt-1.5 text-[11px] font-semibold text-amber-100 underline"
          onClick={onOpenProviders}
        >
          Open Settings → Providers
        </button>
      ) : null}
    </div>
  );
}
