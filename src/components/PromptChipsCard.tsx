import type { PromptChip } from '@/lib/chatPromptChips';
import { ChatMarkdown } from '@/lib/chatMarkdown';

export function PromptChipsCard({
  body,
  chips,
  onPick,
}: {
  body: string;
  chips: PromptChip[];
  onPick: (prompt: string) => void;
}) {
  return (
    <div className="space-y-3 text-base leading-relaxed">
      {body ? <ChatMarkdown text={body} /> : null}
      {chips.length ? (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {chips.map(chip => (
            <button
              key={chip.prompt}
              type="button"
              className="text-[11px] rounded-full border border-sky-500/35 bg-sky-500/10 text-sky-200 px-3 py-1.5 hover:bg-sky-500/20 transition-colors"
              onClick={() => onPick(chip.prompt)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
