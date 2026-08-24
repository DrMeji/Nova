import { Trash2 } from 'lucide-react';
import { Modal } from '@/components/Modal';

export type DeleteFilePrompt = {
  fileName: string;
  filePath: string;
};

type Props = {
  prompt: DeleteFilePrompt | null;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeleteFileModal({ prompt, busy, onCancel, onConfirm }: Props) {
  return (
    <Modal
      isOpen={Boolean(prompt)}
      onClose={busy ? () => undefined : onCancel}
      size="sm"
      hideHeader
      title="Delete file from your PC?"
    >
      <div className="px-6 pt-6 pb-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-400/25 flex items-center justify-center shrink-0">
            <Trash2 className="w-4 h-4 text-rose-300" />
          </div>
          <div className="min-w-0 pt-0.5">
            <h2 className="text-base font-semibold text-content-primary tracking-tight">
              Delete this file?
            </h2>
            <p className="text-sm text-content-secondary leading-relaxed mt-2">
              Permanently remove{' '}
              <span className="text-content-primary font-medium">“{prompt?.fileName || 'this file'}”</span>
              . This only deletes that file. not the whole project folder.
            </p>
            {prompt?.filePath ? (
              <p className="mt-3 text-xs text-content-tertiary font-mono break-all leading-relaxed rounded-lg border border-surface-border bg-surface-hover/40 px-3 py-2">
                {prompt.filePath}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-7">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-full px-4 py-2 text-xs font-medium text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="rounded-full px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-colors disabled:opacity-60"
          >
            {busy ? 'Deleting…' : 'Delete file'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
