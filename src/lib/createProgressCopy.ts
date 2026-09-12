/**
 * Professional live status copy while create / edit work runs.
 * Keeps the chat bubble moving so long GGUF / cloud waits never look frozen.
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
  | 'edit';

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
    'Writing the Vite shell…',
    'Dropping package.json and entry files…',
  ],
  equip: [
    'Equipping design skills…',
    'Loading brand and layout guidance…',
  ],
  assets: [
    'Importing logos and icons into public/…',
    'Fetching hero photos…',
    'Wiring local asset paths…',
  ],
  layout: [
    'Building the React layout in App.jsx…',
    'Placing nav, hero, and sections…',
    'Writing structural JSX…',
  ],
  styles: [
    'Designing App.css…',
    'Tuning typography and color…',
    'Adding motion and atmosphere…',
  ],
  polish: [
    'Polishing interaction and hover states…',
    'Tightening spacing and hierarchy…',
    'Finishing visual details…',
  ],
  repair: [
    'Preview check failed — fixing the broken parts…',
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
};

/** Rotate a professional line for the given phase (stable across short intervals). */
export function createProgressLabel(phase: CreateProgressPhase, tick = 0): string {
  const lines = PHASE_LINES[phase] || PHASE_LINES.edit;
  return lines[Math.abs(tick) % lines.length];
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
  if (/App\.(jsx|tsx)|main\.(jsx|tsx)/i.test(raw)) return 'Updating App.jsx…';
  if (/package\.json|npm install/i.test(raw)) return 'Updating package setup…';
  if (/Preview check|too thin|empty shell|prose leak|truncated/i.test(raw)) {
    return createProgressLabel('repair', Date.now());
  }
  if (raw.trim().length > 12) return raw.trim().replace(/\s+/g, ' ').slice(0, 120);
  return createProgressLabel(fallbackPhase, Date.now());
}

/**
 * While a long await runs, pulse status labels so the bubble never freezes.
 * Caller must clear the returned timer.
 */
export function startProgressHeartbeat(
  push: (label: string) => void,
  phase: CreateProgressPhase,
  intervalMs = 4200,
): () => void {
  let tick = 0;
  push(createProgressLabel(phase, tick));
  const id = window.setInterval(() => {
    tick += 1;
    push(createProgressLabel(phase, tick));
  }, intervalMs);
  return () => window.clearInterval(id);
}
