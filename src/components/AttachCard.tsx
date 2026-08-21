import type { ReactNode } from 'react';
import { FileIcon, FolderOpen, ImageIcon } from 'lucide-react';
import {
  attachSubtitle,
  parseChatAttaches,
  stripChatAttach,
  type ChatAttachMeta,
} from '@/lib/chatAttach';

/** Compact Cursor-style attach chip (not a large card). */
export function AttachCard({ meta }: { meta: ChatAttachMeta }) {
  const Icon = meta.kind === 'folder'
    ? FolderOpen
    : meta.kind === 'image'
      ? ImageIcon
      : FileIcon;
  return (
    <span className="inline-flex items-center gap-1.5 max-w-[14rem] rounded-lg border border-surface-border bg-ark-navy-950/90 pl-1.5 pr-2 py-1">
      <span className="w-5 h-5 rounded-md bg-surface-hover border border-surface-border flex items-center justify-center shrink-0">
        <Icon className="w-3 h-3 text-content-secondary" />
      </span>
      <span className="min-w-0 text-left leading-tight">
        <span className="block text-[11px] text-content-primary truncate font-medium">{meta.name}</span>
        <span className="block text-[9px] text-content-tertiary truncate">{attachSubtitle(meta)}</span>
      </span>
    </span>
  );
}

const AUTO_READ_RE = /<!--ark-auto-read-->/g;

/** Card(s) + optional trailing plain text (hides internal auto-read marker). */
export function AttachMessageBody({
  content,
  children,
}: {
  content: string;
  children?: ReactNode;
}) {
  const metas = parseChatAttaches(content);
  if (!metas.length) return null;
  const rest = stripChatAttach(content).replace(AUTO_READ_RE, '').trim();
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {metas.map(meta => (
          <AttachCard key={`${meta.kind}:${meta.projectId || ''}:${meta.name}`} meta={meta} />
        ))}
      </div>
      {children}
      {rest && !children ? (
        <p className="text-sm text-content-primary whitespace-pre-wrap leading-relaxed">{rest}</p>
      ) : null}
    </div>
  );
}
