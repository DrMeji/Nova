/**
 * @deprecated Import from `@/lib/novaSkills` instead.
 * Thin re-export so older scripts keep resolving.
 */
export {
  NOVA_SKILL_PACKS as ARK_SKILL_PACKS,
  NOVA_SKILL_PACKS,
  getEnabledSkillIds,
  setEnabledSkillIds,
  toggleSkillEnabled,
  selectSkillsForBrief,
  formatSkillsForPrompt,
  skillPromptAppendix,
  skillPromptAppendixAsync,
  resolveSkillsForBrief,
  loadProjectSkills,
  listBuiltinSkillPacks,
  skillNamesLabel,
  type NovaSkillPack as ArkSkillPack,
  type BuiltinNovaSkillId as ArkSkillId,
  type NovaSkillPack,
  type BuiltinNovaSkillId,
  type NovaSkillId,
} from '@/lib/novaSkills';
