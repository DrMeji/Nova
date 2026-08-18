import { FolderOpen, Github, FilePlus2, Smartphone } from 'lucide-react';

type Props = {
  onOpenFolder: () => void;
  onOpenGithub: () => void;
  onStartBlank: () => void;
  onStartIphone: () => void;
  onStartAndroid: () => void;
};

export function StudioEmptyState({
  onOpenFolder,
  onOpenGithub,
  onStartBlank,
  onStartIphone,
  onStartAndroid,
}: Props) {
  return (
    <div className="px-3 py-6 space-y-3">
      <p className="text-[11px] text-content-tertiary leading-relaxed text-center px-1">
        Plug a project in, then start working.
      </p>
      <button
        type="button"
        onClick={onOpenFolder}
        className="w-full text-left rounded-xl border border-surface-border bg-ark-navy-950/60 px-3 py-2.5 hover:bg-surface-hover transition-colors"
      >
        <span className="flex items-center gap-2 text-sm text-content-primary">
          <FolderOpen className="w-4 h-4 text-sky-400 shrink-0" />
          Open folder
        </span>
        <span className="block text-[11px] text-content-tertiary mt-0.5 pl-6">
          Drop in the app on this PC
        </span>
      </button>
      <button
        type="button"
        onClick={onOpenGithub}
        className="w-full text-left rounded-xl border border-surface-border bg-ark-navy-950/60 px-3 py-2.5 hover:bg-surface-hover transition-colors"
      >
        <span className="flex items-center gap-2 text-sm text-content-primary">
          <Github className="w-4 h-4 text-content-secondary shrink-0" />
          Open my GitHub
        </span>
        <span className="block text-[11px] text-content-tertiary mt-0.5 pl-6">
          Pick a repo — empty is fine
        </span>
      </button>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onStartIphone}
          className="text-left rounded-xl border border-surface-border bg-ark-navy-950/60 px-3 py-2.5 hover:bg-surface-hover transition-colors"
        >
          <span className="flex items-center gap-2 text-sm text-content-primary">
            <Smartphone className="w-4 h-4 text-sky-400 shrink-0" />
            New iPhone
          </span>
          <span className="block text-[11px] text-content-tertiary mt-0.5 pl-6">
            SwiftUI + Xcode
          </span>
        </button>
        <button
          type="button"
          onClick={onStartAndroid}
          className="text-left rounded-xl border border-surface-border bg-ark-navy-950/60 px-3 py-2.5 hover:bg-surface-hover transition-colors"
        >
          <span className="flex items-center gap-2 text-sm text-content-primary">
            <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
            New Android
          </span>
          <span className="block text-[11px] text-content-tertiary mt-0.5 pl-6">
            Kotlin + Studio
          </span>
        </button>
      </div>
      <button
        type="button"
        onClick={onStartBlank}
        className="w-full text-left rounded-xl border border-surface-border bg-ark-navy-950/60 px-3 py-2.5 hover:bg-surface-hover transition-colors"
      >
        <span className="flex items-center gap-2 text-sm text-content-primary">
          <FilePlus2 className="w-4 h-4 text-violet-400 shrink-0" />
          Start blank
        </span>
        <span className="block text-[11px] text-content-tertiary mt-0.5 pl-6">
          Empty page, then add in chat
        </span>
      </button>
    </div>
  );
}
