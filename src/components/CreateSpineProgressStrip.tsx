/**
 * Create spine chrome — retired from the composer and from chip strips.
 * Stages advance as normal Working-dropdown rows (Heal / Craft / Install / …).
 */
import type { ThinCreateStage } from '@/lib/createThinPath';
import { THIN_CREATE_STAGES } from '@/lib/createThinPath';

export const SPINE_SHORT: Record<ThinCreateStage, string> = {
  'hard-go': 'Go',
  brief: 'Brief',
  disk: 'Disk',
  scaffold: 'Scaffold',
  floor: 'Floor',
  npm: 'npm',
  craft: 'Craft',
  heal: 'Heal',
  syntax: 'Syntax',
  live: 'Live',
  prove: 'Prove',
  ready: 'Ready',
};

/** Kept for smokes / callers — progressive window helper (no UI). */
export function progressiveSpineStages(
  stage: ThinCreateStage | null,
  windowSize = 3,
): { stages: ThinCreateStage[]; activeIdx: number; absoluteIdx: number } {
  if (!stage) return { stages: [], activeIdx: -1, absoluteIdx: -1 };
  const absoluteIdx = THIN_CREATE_STAGES.indexOf(stage);
  if (absoluteIdx < 0) return { stages: [], activeIdx: -1, absoluteIdx: -1 };
  const reached = THIN_CREATE_STAGES.slice(0, absoluteIdx + 1);
  const stages = reached.length > windowSize
    ? reached.slice(reached.length - windowSize)
    : reached;
  return { stages, activeIdx: stages.length - 1, absoluteIdx };
}

/** @deprecated No chip strip — spine is activity-dropdown rows only. */
export function CreateSpineProgressiveInline(_props?: { finished?: boolean }) {
  return null;
}

/** @deprecated Composer strip removed. */
export function CreateSpineProgressStrip(_props?: { forceShow?: boolean }) {
  return null;
}
