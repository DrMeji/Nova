import { getChatTurnStatus } from '@/lib/chatTurnStatusStore';

/**
 * Professional live status copy while create / edit work runs.
 * Keeps the chat bubble moving so long GGUF / cloud waits never look frozen.
 * Prefer file-specific lines ("Building src/App.tsx…") over vague phases.
 * No em-dashes in user-facing copy.
 */

export type CreateProgressPhase =
  | 'brief'
  | 'folder'
  | 'scaffold'
  | 'equip'
  | 'assets'
  | 'layout'
  | 'styles'
  | 'polish'
  | 'repair'
  | 'install'
  | 'preview'
  | 'verify'
  | 'edit'
  | 'file';

/** Mid-build lines only. "Almost done" is never rotated here. */
const PHASE_LINES: Record<CreateProgressPhase, string[]> = {
  brief: [
    'Reading your brief…',
    'Understanding the product and tone…',
    'Mapping sections from your ask…',
  ],
  folder: [
    'Creating the project folder…',
    'Setting up the workspace on disk…',
  ],
  scaffold: [
    'Writing project files one by one…',
    'Scaffolding the Vite project…',
  ],
  equip: [
    'Equipping design skills…',
    'Loading brand and layout guidance…',
  ],
  assets: [
    'Generating product photography…',
    'Saving hero and story images to public/…',
    'Wiring local image paths into the page…',
  ],
  layout: [
    'Coding the React layout in App…',
    'Placing nav, hero, and sections…',
    'Coding page structure…',
  ],
  styles: [
    'Coding App.css…',
    'Tuning typography and color…',
  ],
  polish: [
    'Coder is working through your brief…',
    'Building the product UI…',
    'Deepening layout and interactions…',
    'Polishing visuals and spacing…',
  ],
  repair: [
    'Preview check failed: fixing the broken parts…',
    'Repairing thin CSS and layout gaps…',
    'Rebuilding the weak sections…',
  ],
  install: [
    'Installing npm dependencies…',
    'Resolving packages for Preview…',
  ],
  preview: [
    'Starting the live Preview server…',
    'Opening localhost for the site…',
  ],
  verify: [
    'Checking Preview is really ready…',
    'Confirming brand, hero, and structure…',
  ],
  edit: [
    'Updating project files…',
    'Applying your change on disk…',
    'Patching App and styles…',
  ],
  file: [
    'Writing the next project file…',
  ],
};

/** Only push this when polish is actually finishing (gate / apply / verify). */
export const POLISH_ALMOST_DONE_LABEL = 'Almost done: finishing visual polish…';
export const POLISH_FINAL_PASS_LABEL = 'Final pass: checking the UI hangs together…';

/** Human label for a scaffold / polish file path shown in the generating bubble. */
export function createFileBuildLabel(
  relPath: string,
  verb: 'Building' | 'Writing' | 'Coding' | 'Updating' = 'Building',
): string {
  const rel = String(relPath || '').replace(/\\/g, '/').replace(/^\.\//, '');
  const base = rel.split('/').pop() || rel;
  if (/^package\.json$/i.test(base)) {
    return `${verb} package.json: dependencies and project name…`;
  }
  if (/^index\.html$/i.test(base)) {
    return `${verb} index.html: page shell and title…`;
  }
  if (/^vite\.config\./i.test(base)) {
    return `${verb} vite.config: local Preview server setup…`;
  }
  if (/^tsconfig/i.test(base)) {
    return `${verb} tsconfig: TypeScript project settings…`;
  }
  if (/^\.gitignore$/i.test(base)) {
    return `${verb} .gitignore: ignoring node_modules and build output…`;
  }
  if (/^App\.(tsx|jsx)$/i.test(base)) {
    return `${verb} ${rel}: layout, sections, and interactions…`;
  }
  if (/^App\.css$/i.test(base)) {
    return `${verb} ${rel}: colors, spacing, and styles…`;
  }
  if (/^main\.(tsx|jsx)$/i.test(base)) {
    return `${verb} ${rel}: React entrypoint…`;
  }
  if (/^index\.css$/i.test(base)) {
    return `${verb} ${rel}: base page styles…`;
  }
  if (/heroes?\//i.test(rel) || /\.(png|jpe?g|webp|svg)$/i.test(base)) {
    return `${verb} ${rel}: local product / hero image…`;
  }
  if (/icons?\//i.test(rel)) {
    return `${verb} ${rel}: nav / UI icon…`;
  }
  return `${verb} ${rel}…`;
}

/** Professional status when a file failed verify and is being rewritten. */
export function createFileReEditLabel(relPath: string): string {
  const rel = String(relPath || '').replace(/\\/g, '/').replace(/^\.\//, '');
  return `Re-editing ${rel}: completing an unfinished write…`;
}

/** Rotate a professional line for the given phase (stable across short intervals). */
export function createProgressLabel(phase: CreateProgressPhase, tick = 0): string {
  const lines = PHASE_LINES[phase] || PHASE_LINES.edit;
  // Never wrap past the last mid-line into a fake "almost done".
  const idx = Math.min(Math.abs(tick), lines.length - 1);
  return lines[idx];
}

/** Map streaming / file hints into a clearer user-facing line. */
export function enrichLiveBuildStatus(partial: string, fallbackPhase: CreateProgressPhase = 'layout'): string {
  const raw = String(partial || '');
  if (/pollinations|unsplash|hero|background-image/i.test(raw) && /\.(css|jsx|tsx)/i.test(raw)) {
    return 'Updating background and hero imagery…';
  }
  if (/logo\.svg|simple-icons|nav-icon|\/icons\//i.test(raw)) {
    return 'Adding logo and nav icons…';
  }
  if (/@keyframes|animation|ken-?burn|parallax|transition/i.test(raw)) {
    return 'Adding motion and polish…';
  }
  if (/footer|nav|header|hero|section/i.test(raw) && /@@@FILE|className=/i.test(raw)) {
    return 'Building page sections…';
  }
  if (/\.css\b|App\.css|index\.css/i.test(raw)) return 'Updating CSS…';
  if (/App\.(jsx|tsx)|main\.(jsx|tsx)/i.test(raw)) return 'Updating App…';
  if (/package\.json|npm install/i.test(raw)) return 'Updating package setup…';
  if (/Preview check|too thin|empty shell|prose leak|truncated/i.test(raw)) {
    return createProgressLabel('repair', Date.now());
  }
  if (raw.trim().length > 12) {
    return raw.trim().replace(/\s+/g, ' ').replace(/\u2014/g, ':').slice(0, 120);
  }
  return createProgressLabel(fallbackPhase, Date.now());
}

/**
 * While a long await runs, pulse status labels so the bubble never freezes.
 * Holds on the last mid-phase line (never cycles into "almost done").
 * Skips a tick when the live status is already a file-coding line (so we do not
 * overwrite "Coding App.css…" with a vague polish phrase mid-write).
 * Caller must clear the returned timer.
 */
export function startProgressHeartbeat(
  push: (label: string) => void,
  phase: CreateProgressPhase,
  intervalMs = 5200,
): () => void {
  let tick = 0;
  let stopped = false;
  push(createProgressLabel(phase, tick));
  const lines = PHASE_LINES[phase] || PHASE_LINES.edit;
  const id = window.setInterval(() => {
    if (stopped) return;
    tick += 1;
    try {
      const cur = getChatTurnStatus()?.label || '';
      // Never overwrite a terminal Done / Final-pass gate label.
      if (/^done$/i.test(cur) || /final pass:/i.test(cur) || /almost done:/i.test(cur)) {
        return;
      }
      if (/\b(?:Coding|Writing|Building|Updating|Still waiting on the coder)\b/i.test(cur)
        && /\.(?:tsx?|jsx?|css|html|json)\b/i.test(cur)) {
        return;
      }
    } catch { /* ignore */ }
    // Cap at last mid-line so "almost done" is never heartbeat-driven.
    push(createProgressLabel(phase, Math.min(tick, lines.length - 1)));
  }, intervalMs);
  return () => {
    stopped = true;
    window.clearInterval(id);
  };
}
