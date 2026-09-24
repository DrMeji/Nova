import { classifyErrorMessage, type ArkErrorInfo } from '@/lib/errors';
import { useRouter } from '@/context/RouterContext';

export function NovaErrorInline({
  message,
  info,
  onAction,
}: {
  message: string;
  info?: ArkErrorInfo;
  onAction?: () => void;
}) {
  const { navigate } = useRouter();
  const err = info || classifyErrorMessage(message);
  return (
    <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 px-3 py-2.5 text-sm text-rose-100/90 space-y-2">
      <p className="leading-relaxed whitespace-pre-wrap">{err.message}</p>
      {err.action && (onAction || err.route) ? (
        <button
          type="button"
          className="text-xs font-medium text-rose-200 hover:text-white underline underline-offset-2"
          onClick={() => {
            if (onAction) onAction();
            else if (err.route) navigate(err.route as Parameters<typeof navigate>[0]);
          }}
        >
          {err.action}
        </button>
      ) : null}
    </div>
  );
}
