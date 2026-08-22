import { AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/Modal';

export type DeleteFolderClarifyPrompt = {
  folderName: string;
  folderPath: string;
};

type Props = {
  prompt: DeleteFolderClarifyPrompt | null;
  busy?: boolean;
  onCancel: () => void;
  onConfirmFolder: () => void;
};

export function DeleteFolderClarifyModal({ prompt, busy, onCancel, onConfirmFolder }: Props) {
  return (
    <Modal
      isOpen={Boolean(prompt)}
      onClose={busy ? () => undefined : onCancel}
      size="sm"
      hideHeader
      title="Delete folder instead?"
    >
      <div className="px-6 pt-6 pb-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-400/25 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 text-amber-300" />
          </div>
          <div className="min-w-0 pt-0.5">
            <h2 className="text-base font-semibold text-content-primary tracking-tight">
              That’s a folder, not a file
            </h2>
            <p className="text-sm text-content-secondary leading-relaxed mt-2">
              <span className="text-content-primary font-medium">“{prompt?.folderName || 'this item'}”</span>
              {' '}is a project folder at the path below — not a single file. Delete the whole folder?
            </p>
            {prompt?.folderPath ? (
              <p className="mt-3 text-xs text-content-tertiary font-mono break-all leading-relaxed rounded-lg border border-surface-border bg-surface-hover/40 px-3 py-2">
                {prompt.folderPath}
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
            onClick={onConfirmFolder}
            className="rounded-full px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-colors disabled:opacity-60"
          >
            {busy ? 'Deleting…' : 'Delete entire folder'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
