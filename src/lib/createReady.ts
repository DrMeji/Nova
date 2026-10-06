/**
 * Create Ready ownership — Preview Ready / apple gates live here.
 * create.ts imports Ready checks from this module (not ad-hoc).
 */

export {
  previewReadyForBrief,
  briefLooksLikeAppleStyleHomepage,
  appleHomepageHasProductBands,
  briefLooksLikeMarketingLanding,
  isPreviewReady,
  looksLikeFillerStubAppSource,
  isEmptyOrStubAppSource,
  buildBriefInteractiveFloor,
  healNearReadyCreateUi,
  ensureProductBrandInApp,
  buildUtilityCompanionCss,
} from '@/lib/createBuildQuality';
