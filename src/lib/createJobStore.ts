/**
 * Create job lifecycle — Preview / UI subscribe while npm runs in background.
 * Persists to sessionStorage so a tab refresh can still show Progress / Ready.
 * `ready` means Live verified (evidence.pass) — never unlock without a preview URL.
 */
import { canUnlockCreateLive } from '@/lib/createReady';
import { scoreAskMatch } from '@/lib/createAskContract';
import { verifyCreateRenderedQuality } from '@/lib/createEvidence';
import { preserveOriginalBriefInPrompt } from '@/lib/createBriefContext';
import { shouldPaintStudioLive } from '@/lib/chatTurnIsolation';
import { briefWantsProductLadder, gradeProductQuality } from '@/lib/createProductLadder';
import { briefWantsStorefrontLadder, gradeStorefrontQuality } from '@/lib/createStorefrontLadder';

export type CreateJobStatus = 'writing' | 'npm' | 'verifying' | 'ready' | 'failed';

export type CreateJob = {
  id: string;
  chatId: string;
  path: string;
  projectId: string;
  name: string;
  files: Record<string, string>;
  /** User brief retained separately from generated planning/craft instructions. */
  originalBrief?: string;
  /** Full prompt context used to generate the project. */
  generationBrief?: string;
  status: CreateJobStatus;
  previewUrl?: string | null;
  error?: string;
  /** CRL stage label for status strip */
  stage?: string;
  /** Last evidence / observation snippet */
  lastObservation?: string;
  /** Evidence pass summary for Jobs / ladder */
  evidencePass?: boolean | null;
  /**
   * Craft/depth preflight failed — Live must stay locked as "unverified".
   * markCreateJobReady refuses to promote these to evidencePass unless explicitly allowed.
   */
  craftBlocked?: boolean;
  /** Structured reasons when craftBlocked (depth deficits, syntax, etc.) */
  blockedReasons?: string[];
  updatedAt: number;
  /** Only allow background progress when the owner's chat was explicitly left mid-turn. */
  backgroundAllowed?: boolean;
  routeChatIdAtStart?: string | null;
};

const jobs = new Map<string, CreateJob>();
const byChat = new Map<string, string>();
const listeners = new Set<() => void>();

function storageKey(chatId: string) {
  return `nova-create-job:${chatId}`;
}

function persistJob(job: CreateJob) {
  try {
    // Keep App/main/css/logo always (hydrate gates need them). Cap other bodies.
    const slimFiles: Record<string, string> = {};
    const alwaysKeep = /^(src\/App\.(jsx|tsx|css)|src\/main\.(jsx|tsx)|src\/index\.css|public\/logo\.svg|package\.json)$/i;
    for (const [k, v] of Object.entries(job.files || {})) {
      if (typeof v !== 'string') continue;
      const norm = k.replace(/\\/g, '/');
      if (alwaysKeep.test(norm) || /^src\/sections\/.+\.jsx?$/i.test(norm)) {
        slimFiles[norm] = v.length <= 200_000 ? v : v.slice(0, 200_000);
        continue;
      }
    }
    let extras = 0;
    for (const [k, v] of Object.entries(job.files || {})) {
      if (typeof v !== 'string' || slimFiles[k.replace(/\\/g, '/')]) continue;
      if (v.length > 80_000) continue;
      if (extras >= 24) break;
      slimFiles[k.replace(/\\/g, '/')] = v;
      extras += 1;
    }
    sessionStorage.setItem(storageKey(job.chatId), JSON.stringify({
      ...job,
      files: slimFiles,
    }));
  } catch {
    /* quota / private mode */
  }
}

function normalizeHydratedJob(parsed: CreateJob): CreateJob {
  // Stale in-flight jobs must not trap Live forever after a crash / kill.
  const age = Date.now() - (Number(parsed.updatedAt) || 0);
  const inflight = parsed.status === 'writing' || parsed.status === 'npm' || parsed.status === 'verifying';
  let dirty = false;
  if (inflight && age > 25 * 60_000) {
    parsed.status = 'failed';
    parsed.error = parsed.error || 'Create interrupted (stale job) — tell me what to fix, or open Live again';
    parsed.evidencePass = false;
    dirty = true;
  }
  // craftBlocked must never rehydrate with a Live URL (Workspace auto-attach).
  if (parsed.craftBlocked) {
    if (parsed.previewUrl) dirty = true;
    parsed.previewUrl = null;
    parsed.evidencePass = false;
    if (parsed.status === 'ready') {
      parsed.status = 'failed';
      dirty = true;
    }
  }
  if (dirty) persistJob(parsed);
  return parsed;
}

function hydrateFromSession(chatId: string): CreateJob | null {
  if (!chatId) return null;
  try {
    const raw = sessionStorage.getItem(storageKey(chatId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CreateJob;
    if (!parsed?.id || !parsed.chatId) return null;
    const job = normalizeHydratedJob(parsed);
    jobs.set(job.id, job);
    byChat.set(job.chatId, job.id);
    return job;
  } catch {
    return null;
  }
}

/** Scan sessionStorage so project/path lookups work after reload (chat hydrate alone is not enough). */
function hydrateAllFromSession(): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    const prefix = 'nova-create-job:';
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const chatId = key.slice(prefix.length);
      if (!chatId || byChat.has(chatId)) continue;
      hydrateFromSession(chatId);
    }
  } catch {
    /* private mode / quota */
  }
}

let emitScheduled = false;
function emit() {
  // C7: coalesce bursts (create status thrash) into one microtask fan-out.
  if (emitScheduled) return;
  emitScheduled = true;
  queueMicrotask(() => {
    emitScheduled = false;
    listeners.forEach((l) => {
      try { l(); } catch { /* ignore */ }
    });
  });
}

export function subscribeCreateJobs(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getCreateJob(id: string): CreateJob | null {
  return jobs.get(id) || null;
}

export function getCreateJobForChat(chatId: string): CreateJob | null {
  const id = byChat.get(chatId);
  if (id) {
    const mem = jobs.get(id);
    if (mem) return mem;
  }
  return hydrateFromSession(chatId);
}

/** Lookup create job by project id (Workspace Preview attach). */
export function getCreateJobForProject(projectId: string): CreateJob | null {
  const pid = String(projectId || '').trim();
  if (!pid) return null;
  for (const job of jobs.values()) {
    if (job.projectId === pid) return job;
  }
  hydrateAllFromSession();
  for (const job of jobs.values()) {
    if (job.projectId === pid) return job;
  }
  return null;
}

/** Lookup create job by disk path (normalize case for Windows). */
export function getCreateJobForPath(diskPath: string): CreateJob | null {
  const key = String(diskPath || '').trim().toLowerCase();
  if (!key) return null;
  for (const job of jobs.values()) {
    if (String(job.path || '').trim().toLowerCase() === key) return job;
  }
  hydrateAllFromSession();
  for (const job of jobs.values()) {
    if (String(job.path || '').trim().toLowerCase() === key) return job;
  }
  return null;
}

/**
 * Most recent create job that still has a disk folder — used when a UI edit ask
 * lands in a chat that lost its Folder/Code bind (e.g. New Chat mid step-ladder).
 */
export function getLatestReusableCreateJob(): CreateJob | null {
  hydrateAllFromSession();
  let best: CreateJob | null = null;
  for (const job of jobs.values()) {
    if (!String(job.path || '').trim()) continue;
    if (job.status === 'failed' && !job.previewUrl) continue;
    if (!best || (Number(job.updatedAt) || 0) > (Number(best.updatedAt) || 0)) {
      best = job;
    }
  }
  return best;
}

export function startCreateJob(partial: Omit<CreateJob, 'updatedAt' | 'status'> & { status?: CreateJobStatus }): CreateJob {
  const job: CreateJob = {
    ...partial,
    status: partial.status || 'writing',
    updatedAt: Date.now(),
  };
  jobs.set(job.id, job);
  byChat.set(job.chatId, job.id);
  persistJob(job);
  emit();
  return job;
}

export function updateCreateJob(id: string, patch: Partial<CreateJob>): CreateJob | null {
  const prev = jobs.get(id);
  if (!prev) return null;
  const next = { ...prev, ...patch, id: prev.id, updatedAt: Date.now() };
  jobs.set(id, next);
  byChat.set(next.chatId, id);
  persistJob(next);
  emit();
  return next;
}

export function markCreateJobNpm(id: string): void {
  const prev = jobs.get(id);
  if (!prev || prev.status === 'failed' || prev.status === 'ready') return;
  updateCreateJob(id, { status: 'npm', stage: 'install' });
}

export function markCreateJobVerifying(id: string, stage?: string, observation?: string): void {
  const prev = jobs.get(id);
  if (!prev || prev.status === 'failed' || prev.status === 'ready') return;
  updateCreateJob(id, {
    status: 'verifying',
    stage: stage || 'live',
    lastObservation: observation ? String(observation).slice(0, 400) : undefined,
  });
}

/**
 * Abort only when the create is terminal, or the user left the owner chat without
 * background permission. Viewing the origin chat must never abort.
 */
export function shouldAbortCreateJob(id: string, routeChatId: string | null | undefined): boolean {
  const job = jobs.get(id);
  if (!job) return true;
  if (job.status === 'failed' || job.status === 'ready') return true;
  if (shouldPaintStudioLive(routeChatId, job.chatId)) return false;
  return job.backgroundAllowed !== true;
}

export function markCreateJobReady(
  id: string,
  previewUrl?: string | null,
  observation?: string,
  opts?: { allowDespiteCraftBlocked?: boolean; brief?: string; requireQuality?: boolean },
): void {
  const url = String(previewUrl || '').trim();
  if (!url) {
    // CONFLICT REMOVED: Ready-without-Live URL unlocked blank Live windows.
    markCreateJobFailed(id, 'Cannot mark Ready without a Live preview URL');
    return;
  }
  const prev = jobs.get(id);
  if (!opts?.allowDespiteCraftBlocked && prev) {
    const originalBrief = String(opts?.brief || prev.originalBrief || '').trim();
    if (prev.status === 'failed' || prev.craftBlocked) {
      updateCreateJob(id, {
        previewUrl: url,
        evidencePass: false,
        status: 'failed',
        blockedReasons: prev.blockedReasons,
      });
      return;
    }
    const generationBrief = preserveOriginalBriefInPrompt(
      originalBrief,
      String(prev.generationBrief || originalBrief),
      24_000,
    );
    const unlock = canUnlockCreateLive(
      { ...prev, previewUrl: url, status: 'verifying', originalBrief },
      prev.files || {},
      originalBrief,
    );
    const productBrief = /\b(?:website|site|homepage|landing|brand|shop|store|marketing|product\s+page)\b/i.test(originalBrief);
    const askMatch = originalBrief && productBrief
      ? scoreAskMatch(prev.files || {}, originalBrief, prev.name)
      : { ok: true, score: 10, reasons: [] };
    const unlockReasons = [...unlock.reasons];
    const qualityGateReasons = [
      ...unlockReasons,
      ...(!askMatch.ok ? [`original brief mismatch (${askMatch.score}/10)`, ...askMatch.reasons] : []),
    ];
    if (opts?.requireQuality === true) {
      if (!originalBrief) qualityGateReasons.push('original user brief missing; requirements could not be checked');
      const rendered = verifyCreateRenderedQuality(prev.files || {}, originalBrief, prev.name);
      qualityGateReasons.push(...rendered.reasons);
    }
    // Product / brand landings: Ready requires Quality+ on the product ladder (Nova source gate).
    let productLadderBlocked = false;
    if (originalBrief && briefWantsProductLadder(originalBrief)) {
      const graded = gradeProductQuality(prev.files || {}, originalBrief, prev.name || '');
      if (!graded.okQuality) {
        productLadderBlocked = true;
        qualityGateReasons.push(
          `product ladder ${graded.label} — Ready needs Quality+`,
          ...graded.reasons.slice(0, 4),
        );
      }
    }
    // Storefront / catalog shops: Ready requires Quality+ on the storefront ladder.
    let storefrontLadderBlocked = false;
    if (
      originalBrief
      && !productLadderBlocked
      && briefWantsStorefrontLadder(originalBrief, prev.name || '')
    ) {
      const graded = gradeStorefrontQuality(prev.files || {}, originalBrief, prev.name || '');
      if (!graded.okQuality) {
        storefrontLadderBlocked = true;
        qualityGateReasons.push(
          `storefront ladder ${graded.label} — Ready needs Quality+`,
          ...graded.reasons.slice(0, 4),
        );
      }
    }
    const askGateRequired = opts?.requireQuality === true
      || /(?:website|homepage|landing|brand|marketing|product|shop|store)/i.test(originalBrief);
    const newQualityDeficits = qualityGateReasons.slice(unlockReasons.length);
    // Hard Live blockers only (craft blocked / failed / missing URL). Soft composition notes stay on unlock.ok.
    // Product Quality lock is also hard — never "Live open, quality later" below Quality.
    if (!unlock.ok || productLadderBlocked || storefrontLadderBlocked) {
      updateCreateJob(id, {
        previewUrl: url,
        evidencePass: false,
        status: 'failed',
        stage: 'unverified',
        craftBlocked: Boolean(prev.craftBlocked)
          || productLadderBlocked
          || storefrontLadderBlocked
          || unlock.reasons.some((r) => /craft blocked|thin depth/i.test(r)),
        blockedReasons: qualityGateReasons.slice(0, 12),
        lastObservation: observation
          ? `${String(observation).slice(0, 180)} · Ready blocked: ${qualityGateReasons.slice(0, 2).join('; ')}`.slice(0, 400)
          : `Preview opened (unverified: ${qualityGateReasons.slice(0, 2).join('; ')})`,
      });
      return;
    }
    // Blank / step-ladder solid pages: the painted shell IS the deliverable — never soft-fail
    // into a forever "Verifying…" chip because "coffee site" brief still wants a brand name.
    const blankNegated = /\b(?:not|n't|never|no|avoid|without|instead of)\b[\s\S]{0,24}\bblank\b/i.test(originalBrief);
    const richStorefront = /\b(?:e-?commerce|storefront|add[\s-]?to[\s-]?(?:cart|bag)|product\s+(?:grid|catalog)|exactly\s+\d+\s+(?:bottles?|products?))\b/i.test(originalBrief);
    const blankSolidAsk = !blankNegated && !richStorefront
      && /\b(?:blank|nothing else|plain\s+white|white\s+(?:blank\s+)?page|empty\s+page)\b/i.test(originalBrief);
    if (blankSolidAsk) {
      if (originalBrief) updateCreateJob(id, { originalBrief, generationBrief });
      updateCreateJob(id, {
        status: 'ready',
        previewUrl: url,
        error: undefined,
        evidencePass: true,
        craftBlocked: false,
        blockedReasons: undefined,
        stage: 'verified',
        lastObservation: observation
          ? String(observation).slice(0, 400)
          : 'Blank page Live ready',
      });
      return;
    }
    // Coding foundation: mount Live even when quality/ask still soft-fail — never craftBlock after URL Live.
    // IMPORTANT: do NOT leave status as "verifying" (that freezes the Verifying… chip forever).
    if (askGateRequired && newQualityDeficits.length > 0) {
      markCreateJobLiveOpen(
        id,
        url,
        observation
          ? `${String(observation).slice(0, 180)} · Live open (quality later: ${newQualityDeficits.slice(0, 2).join('; ')})`.slice(0, 400)
          : `Live open — quality later: ${newQualityDeficits.slice(0, 2).join('; ')}`,
        originalBrief,
        prev.files || {},
        qualityGateReasons.slice(0, 12),
      );
      return;
    }
    if (originalBrief) updateCreateJob(id, { originalBrief, generationBrief });
  }
  updateCreateJob(id, {
    status: 'ready',
    previewUrl: url,
    error: undefined,
    evidencePass: true,
    craftBlocked: false,
    blockedReasons: undefined,
    stage: 'verified',
    lastObservation: observation ? String(observation).slice(0, 400) : 'Live evidence PASS',
  });
}

/**
 * Live is mounted but full quality Ready soft-failed — keep URL and unlock the Live/Preview
 * pill. Never leave status as "verifying" (that stuck the Verifying… chip after Done).
 */
export function markCreateJobLiveOpen(
  id: string,
  previewUrl: string,
  observation: string,
  brief: string,
  files: Record<string, string>,
  blockedReasons?: string[],
): void {
  const url = String(previewUrl || '').trim();
  if (!url) {
    markCreateJobFailed(id, 'Live open denied — missing preview URL');
    return;
  }
  const prev = jobs.get(id);
  if (prev?.status === 'failed' && prev.craftBlocked) {
    updateCreateJob(id, {
      files,
      originalBrief: brief,
      previewUrl: url,
      evidencePass: false,
      stage: 'live',
      lastObservation: String(observation || '').slice(0, 400),
      blockedReasons: (blockedReasons || prev.blockedReasons || []).slice(0, 12),
    });
    return;
  }
  updateCreateJob(id, {
    files,
    originalBrief: brief,
    previewUrl: url,
    // ready + soft blockedReasons → amber Preview pill (openable). Not verifying.
    status: 'ready',
    stage: 'live-open',
    evidencePass: true,
    craftBlocked: false,
    error: undefined,
    blockedReasons: (blockedReasons || []).slice(0, 12),
    lastObservation: String(observation || 'Live mounted · quality not verified').slice(0, 400),
  });
}

export function markCreateJobReadyVerified(
  id: string,
  previewUrl: string,
  observation: string,
  brief: string,
  files: Record<string, string>,
  opts?: { qualityReady?: boolean },
): void {
  updateCreateJob(id, { files, originalBrief: brief });
  const rendered = verifyCreateRenderedQuality(files, brief, jobs.get(id)?.name || '');
  if (opts?.qualityReady === false || !rendered.ok) {
    markCreateJobLiveOpen(
      id,
      previewUrl,
      opts?.qualityReady === false
        ? (observation || 'Live mounted · quality not verified')
        : `Live mounted; Ready denied: ${rendered.reasons.slice(0, 3).join('; ')}`,
      brief,
      files,
      rendered.ok ? undefined : rendered.reasons.slice(0, 12),
    );
    return;
  }
  markCreateJobReady(id, previewUrl, observation, { brief, requireQuality: true });
}
export function markCreateJobFailed(
  id: string,
  error: string,
  observation?: string,
  opts?: { craftBlocked?: boolean; blockedReasons?: string[] },
): void {
  updateCreateJob(id, {
    status: 'failed',
    error,
    evidencePass: false,
    // Fail-closed must not leave a stale URL that Workspace auto-attaches as "ready".
    previewUrl: null,
    craftBlocked: opts?.craftBlocked === true,
    blockedReasons: opts?.blockedReasons?.slice(0, 12),
    stage: opts?.craftBlocked ? 'craft-blocked' : undefined,
    lastObservation: observation ? String(observation).slice(0, 400) : String(error || '').slice(0, 400),
  });
}
