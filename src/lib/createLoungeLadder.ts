/**
 * Ladder-lite create for dusk lounge / listening-room vibe briefs.
 * Ordered verified beats (canvas → brand/CTA → cards → footer → logo)
 * instead of a long parallel invent / tool-loop thrash.
 */

import { finalizeWebEdits } from '@/lib/webProjectCanon';

export const LOUNGE_LADDER_WALL_MS = 10 * 60_000;

export function briefWantsLoungeLadder(brief: string): boolean {
  const t = String(brief || '');
  if (/\bSaaS\s+app\s+shell\b/i.test(t)) return false;
  if (/\bauth\s+screen\b/i.test(t) && /\bbilling\b/i.test(t)) return false;
  // Brand-new creates invent — surgical lounge twin is for rebuild/edit asks only.
  if (/\b(?:create|scaffold)\b/i.test(t) && /\b(?:on\s+disk|brand-new|new\s+website|new\s+project)\b/i.test(t)) {
    return false;
  }
  return (
    /\b(?:cocktail\s+lounge|listening\s+room|listening\s+lounge|vinyl\s+hour|last\s+song|reserve\s+a\s+seat)\b/i.test(t)
    || (/\bvibe\b/i.test(t) && /\b(?:lounge|dusk|cocktail|listening)\b/i.test(t))
  );
}

export type LoungeLadderBeat = {
  id: string;
  label: string;
  verify: (files: Record<string, string>) => boolean;
};

const BEATS: LoungeLadderBeat[] = [
  {
    id: 'canvas',
    label: 'Canvas · plum-black atmosphere',
    verify: (files) => {
      const css = String(files['src/App.css'] || '');
      return /#140c14|#3a1828|radial-gradient/i.test(css) && !/\.hero\s*\{[^}]*min-height:\s*78vh/i.test(css);
    },
  },
  {
    id: 'brand',
    label: 'Brand · name, tag, Reserve a seat',
    verify: (files) => {
      const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
      return (
        /className="brand"/i.test(app)
        && /Reserve a seat/i.test(app)
        && /Stay for the last song|Stay a little longer/i.test(app)
        && !/>\s*["“][^"”]+["”]\s*large/i.test(app)
      );
    },
  },
  {
    id: 'cards',
    label: 'Tonight · Vinyl Hour / Low Lights / Quiet Corner',
    verify: (files) => {
      const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
      return /Vinyl Hour/i.test(app) && /Low Lights/i.test(app) && /Quiet Corner/i.test(app);
    },
  },
  {
    id: 'footer',
    label: 'Footer · hours + email',
    verify: (files) => {
      const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
      return /6pm|2am|Tue/i.test(app) && /type=["']email["']/i.test(app);
    },
  },
  {
    id: 'shell',
    label: 'Shell · lounge page assembled',
    verify: (files) => {
      const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
      return /app vibe|className="app vibe"/i.test(app) && /aria-label="Hero"/i.test(app);
    },
  },
];

export type LoungeLadderHost = {
  pushStatus: (label: string, writingPath?: string | null) => void;
  shouldAbort?: () => boolean;
};

export type LoungeLadderResult = {
  ok: boolean;
  files: Record<string, string>;
  beatsDone: string[];
  failedBeat?: string;
  reason?: string;
  elapsedMs: number;
};

/**
 * Apply the deterministic lounge shell once, then verify each beat landed.
 * One write pass (surgical shell) + ordered verification — not invent thrash.
 */
export async function runLoungeCreateLadder(opts: {
  brief: string;
  productName: string;
  files: Record<string, string>;
  host: LoungeLadderHost;
  startedAt?: number;
  wallMs?: number;
}): Promise<LoungeLadderResult> {
  const startedAt = opts.startedAt ?? Date.now();
  const wallMs = opts.wallMs ?? LOUNGE_LADDER_WALL_MS;
  const timedOut = () => Date.now() - startedAt >= wallMs;
  let files = { ...opts.files };
  const beatsDone: string[] = [];

  if (!briefWantsLoungeLadder(opts.brief)) {
    return {
      ok: false,
      files,
      beatsDone,
      reason: 'Brief is not a lounge/vibe ladder create',
      elapsedMs: Date.now() - startedAt,
    };
  }

  for (const beat of BEATS) {
    if (opts.host.shouldAbort?.() || timedOut()) {
      return {
        ok: false,
        files,
        beatsDone,
        failedBeat: beat.id,
        reason: timedOut()
          ? `Lounge ladder wall (${Math.round(wallMs / 60_000)}m) — craft stalled`
          : 'Create stopped during lounge ladder',
        elapsedMs: Date.now() - startedAt,
      };
    }
    opts.host.pushStatus(`Ladder · ${beat.label}…`);
    // Same surgical shell each beat — idempotent; verify proves the beat.
    const edits = finalizeWebEdits(files, opts.brief, [], { projectName: opts.productName });
    if (edits.length) {
      const next = { ...files };
      for (const e of edits) next[e.path] = e.content;
      files = next;
    }
    if (!beat.verify(files)) {
      return {
        ok: false,
        files,
        beatsDone,
        failedBeat: beat.id,
        reason: `Lounge ladder miss at ${beat.id}: ${beat.label}`,
        elapsedMs: Date.now() - startedAt,
      };
    }
    beatsDone.push(beat.id);
    opts.host.pushStatus(`Ladder · ${beat.label} · verified`);
    await Promise.resolve();
  }

  return {
    ok: true,
    files,
    beatsDone,
    elapsedMs: Date.now() - startedAt,
  };
}
