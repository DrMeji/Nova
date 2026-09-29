/**
 * Build-team readiness — Chat / Design / Coder / Vision before create.
 * Sequential ensemble needs teammate GGUFs on disk; dual-VRAM is unrelated.
 */

import { isEngineDownloadable } from '@/lib/api';
import { getActiveBrainId, isWeakCoderId } from '@/lib/brainRoles';
import {
  isCoderEngineId,
  isUiDesignEngineId,
  rankedReadyCoderIds,
  rankedReadyDesignIds,
  rankedReadyEngineIds,
  DESIGN_ENGINE_RANK,
  CHAT_ENGINE_RANK,
  CODER_ENGINE_RANK,
  pickNextBackupId,
} from '@/lib/enginePick';

export type RoleReadiness = 'ready' | 'fallback' | 'missing' | 'weak';

export type EnsembleRoleStatus = {
  role: 'chat' | 'coder' | 'design' | 'vision';
  status: RoleReadiness;
  id: string | null;
  name: string;
  recommendedId: string;
  why: string;
};

export type EnsembleReadiness = {
  roles: EnsembleRoleStatus[];
  teamScore: 'full' | 'craft-plus' | 'craft-only' | 'no-coder';
  missingLabels: string[];
  canCreate: boolean;
  warnBeforeCreate: boolean;
  summaryLines: string[];
};

type EngineRow = { id?: string; status?: string; name?: string };

function rowName(models: EngineRow[] | undefined, id: string | null): string {
  if (!id) return 'Not installed';
  const hit = (models || []).find((m) => m.id === id);
  return String(hit?.name || id);
}

function readyIds(models: EngineRow[] | undefined): string[] {
  return (models || [])
    .filter((m) => String(m.status || '') === 'ready')
    .map((m) => String(m.id || ''))
    .filter(Boolean);
}

/** Best catalog id to install for a role — never an already-ready model. */
function recommendedInstallId(
  preferred: readonly string[],
  ready: string[],
  fallback: string,
  pickFromRank?: string | undefined,
): string {
  if (pickFromRank && isEngineDownloadable(pickFromRank) && !ready.includes(pickFromRank)) {
    return pickFromRank;
  }
  for (const id of preferred) {
    if (ready.includes(id)) continue;
    if (isEngineDownloadable(id)) return id;
  }
  if (isEngineDownloadable(fallback) && !ready.includes(fallback)) return fallback;
  return fallback;
}

/**
 * Assess which ensemble brains are ready on this PC.
 */
export function assessEnsembleReadiness(
  models: EngineRow[] | undefined,
  opts?: { ramGb?: number; maxCoderParamsB?: number | null },
): EnsembleReadiness {
  const ram = opts?.ramGb ?? 8;
  const maxB = opts?.maxCoderParamsB ?? null;
  const ready = readyIds(models);
  const coders = rankedReadyCoderIds(models, ram, maxB);
  const chats = rankedReadyEngineIds(models, 'chat', ram, maxB);
  const designs = rankedReadyDesignIds(models, ram, maxB);
  const visions = ready.filter((id) => /vl|vision|llava|moondream|minicpm/i.test(id));

  const craftPref = getActiveBrainId('coder');
  const craftId = (craftPref && craftPref !== 'NOVA-auto' && coders.includes(craftPref))
    ? craftPref
    : (coders[0] || null);

  const chatPref = getActiveBrainId('chat');
  const chatId = (chatPref && chatPref !== 'NOVA-auto' && chats.includes(chatPref))
    ? chatPref
    : (chats.find((id) => id !== craftId) || chats[0] || null);

  const designPref = getActiveBrainId('design');
  const designSpecialist = designs.find((id) => isUiDesignEngineId(id)) || null;
  const designId = (designPref && designPref !== 'NOVA-auto' && designs.includes(designPref))
    ? designPref
    : (designSpecialist || designs.find((id) => id !== craftId) || null);

  const visionPref = getActiveBrainId('vision');
  const visionId = (visionPref && visionPref !== 'NOVA-auto' && visions.includes(visionPref))
    ? visionPref
    : (visions[0] || null);

  const chatDistinct = Boolean(chatId && chatId !== craftId);
  const designDistinct = Boolean(designId && designId !== craftId);
  const designIsSpecialist = Boolean(designId && isUiDesignEngineId(designId));

  const roles: EnsembleRoleStatus[] = [
    {
      role: 'chat',
      status: !chatId
        ? 'missing'
        : (isWeakCoderId(chatId) ? 'weak' : (chatDistinct ? 'ready' : 'fallback')),
      id: chatId,
      name: rowName(models, chatId),
      recommendedId: recommendedInstallId(
        CHAT_ENGINE_RANK,
        ready,
        'qwen25-7b',
        pickNextBackupId(models, 'chat', ram, undefined, maxB),
      ),
      why: !chatId
        ? 'Install an Instruct chat model for plan / spec / copy'
        : (chatDistinct ? 'Ready for plan/spec/copy/verify' : 'Will reuse the coder — plan quality drops'),
    },
    {
      role: 'coder',
      status: !craftId
        ? 'missing'
        : (isWeakCoderId(craftId) || !isCoderEngineId(craftId) ? 'weak' : 'ready'),
      id: craftId,
      name: rowName(models, craftId),
      recommendedId: recommendedInstallId(
        CODER_ENGINE_RANK,
        ready,
        'qwen25-coder-7b',
        pickNextBackupId(models, 'coding', ram, undefined, maxB),
      ),
      why: !craftId
        ? 'Required — install a coder GGUF to build'
        : 'Craft / file writes',
    },
    {
      role: 'design',
      status: !designId
        ? 'missing'
        : (designIsSpecialist ? 'ready' : (designDistinct ? 'fallback' : 'fallback')),
      id: designId,
      name: rowName(models, designId),
      recommendedId: recommendedInstallId(DESIGN_ENGINE_RANK, ready, 'uigen-fx-4b', 'uigen-fx-4b'),
      why: !designId
        ? 'Install UIGEN-FX (or Instruct) for Layout Contracts — otherwise genre defaults only'
        : (designIsSpecialist
          ? 'UI specialist for Layout Contract'
          : 'Using Instruct fallback — UIGEN preferred for premium layouts'),
    },
    {
      role: 'vision',
      status: visionId ? 'ready' : 'missing',
      id: visionId,
      name: rowName(models, visionId),
      recommendedId: recommendedInstallId(['qwen2-vl-7b'], ready, 'qwen2-vl-7b'),
      why: visionId
        ? 'Live Critic can grade screenshots'
        : 'Optional — Critic will use text-only without Vision',
    },
  ];

  const coderOk = roles.find((r) => r.role === 'coder')?.status === 'ready';
  const chatOk = roles.find((r) => r.role === 'chat')?.status === 'ready';
  const designOk = roles.find((r) => r.role === 'design')?.status === 'ready';
  const designFallback = roles.find((r) => r.role === 'design')?.status === 'fallback';

  let teamScore: EnsembleReadiness['teamScore'] = 'no-coder';
  if (coderOk && chatOk && designOk) teamScore = 'full';
  else if (coderOk && (chatOk || designOk || designFallback)) teamScore = 'craft-plus';
  else if (coderOk) teamScore = 'craft-only';

  const missingLabels = roles
    .filter((r) => r.status === 'missing' || (r.role === 'design' && r.status === 'fallback' && !designIsSpecialist))
    .filter((r) => r.role !== 'vision' || r.status === 'missing')
    .map((r) => {
      if (r.role === 'design' && r.status === 'fallback') return 'Design specialist (UIGEN)';
      if (r.status === 'missing') {
        return r.role === 'chat' ? 'Chat' : r.role === 'coder' ? 'Coder' : r.role === 'design' ? 'Design' : 'Vision';
      }
      return '';
    })
    .filter(Boolean);

  const warnBeforeCreate = coderOk && (
    roles.find((r) => r.role === 'design')?.status === 'missing'
    || roles.find((r) => r.role === 'chat')?.status === 'missing'
    || (!designIsSpecialist && !designDistinct)
  );

  const summaryLines = roles.map((r) => {
    const mark = r.status === 'ready' ? '✓' : r.status === 'fallback' ? '~' : r.status === 'weak' ? '!' : '✗';
    return `${mark} ${r.role}: ${r.name} — ${r.why}`;
  });

  return {
    roles,
    teamScore,
    missingLabels: [...new Set(missingLabels)],
    canCreate: Boolean(coderOk),
    warnBeforeCreate,
    summaryLines,
  };
}

/** Markdown block for create gate / chat reply. */
export function formatTeamReadinessMarkdown(ready: EnsembleReadiness): string {
  const lines = [
    '**Build team for this PC**',
    '',
    ...ready.summaryLines.map((l) => `- ${l}`),
  ];
  if (ready.warnBeforeCreate && ready.canCreate) {
    lines.push(
      '',
      'Premium builds work best with **Chat + Design + Coder**. You can build with Coder only (lower quality), or install the missing brains under **Models → Design**.',
      '',
      'Say **build anyway** to continue, or open **Models** and install **UIGEN-FX 4B** (Design) plus an Instruct chat model.',
    );
  }
  if (!ready.canCreate) {
    lines.push(
      '',
      'Install a **coder** GGUF under **Models** before creating a project.',
    );
  }
  return lines.join('\n');
}

/** Pref key: user confirmed coder-only create this session. */
const CODER_ONLY_OK_KEY = 'NOVA:create-coder-only-ok';

export function userAcceptedCoderOnlyCreate(): boolean {
  try {
    return sessionStorage.getItem(CODER_ONLY_OK_KEY) === '1';
  } catch {
    return false;
  }
}

export function setUserAcceptedCoderOnlyCreate(ok: boolean): void {
  try {
    if (ok) sessionStorage.setItem(CODER_ONLY_OK_KEY, '1');
    else sessionStorage.removeItem(CODER_ONLY_OK_KEY);
  } catch { /* ignore */ }
}

export function looksLikeBuildAnywayAsk(text: string): boolean {
  return /\b(?:build\s+anyway|coder[- ]?only|continue\s+(?:anyway|without)|skip\s+design)\b/i.test(String(text || ''));
}
