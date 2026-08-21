/**
 * Native phone target from chat: iOS (Xcode), Android (Studio), or both.
 */

export type MobileTarget = 'ios' | 'android' | 'both';

const IOS_RE =
  /\b(iphones?|ipads?|ipods?|ios|macos|macbook|imac|macs?|xcode|swiftui|app store|testflight|apple (app|device|phone|tablet)s?)\b/i;
const ANDROID_RE =
  /\b(android|samsung|galaxy|pixel|play store|google play|kotlin|jetpack compose)\b/i;
const MOBILE_ASK_RE =
  /\b(mobile app|phone app|smartphone|for (a |my |the )?phones?|native app)\b/i;
const PRODUCT_RE =
  /\b(apps?|application|calculator|todo(?:s|\s+list)?|to-?dos?|games?|website|web\s?apps?|landing\s?pages?|dashboards?|clones?|timers?|counters?|notepads?|weather|quiz(?:zes)?|trackers?|chat(?:bot|\s+app)?|habit|recipes?|portfolios?|playlists?|pomodoro|splitters?|pets?|blogs?|stores?|shops?|calendars?|clocks?|cameras?|maps?|messenger)\b/i;
const BUILD_VERB_RE =
  /\b(build|create|make|start|scaffold|generate|spin up)\b/i;

export const WEBSITE_BUILD_MARK =
  'Build this as a website in the browser using HTML, CSS, and JavaScript. Do not write a native phone or tablet project.';

export function classifyMobileTarget(message: string): MobileTarget | null {
  const t = String(message || '');
  const ios = IOS_RE.test(t) || (/\bapple\b/i.test(t) && /\b(app|device|phone|store)\b/i.test(t));
  const android = ANDROID_RE.test(t);
  if (ios && android) return 'both';
  if (ios) return 'ios';
  if (android) return 'android';
  return null;
}

export function looksLikeWebsiteBuild(message: string): boolean {
  const t = String(message || '');
  if (/website in the browser using HTML/i.test(t) || /HTML\/CSS\/JS in the browser/i.test(t)) {
    return true;
  }
  if (/\bhello\s*world\b|\bblank\s+page\b/i.test(t)) return true;
  if (classifyMobileTarget(t)) return false;
  return /\b(website|web\s?app|webapp|landing\s?page|in the browser|for the web|browser (app|page)|html\/css)\b/i.test(t)
    || (/\bhtml\b/i.test(t) && BUILD_VERB_RE.test(t));
}

export function looksLikeKnownStack(message: string): boolean {
  const t = String(message || '');
  return /\b(python|\.py\b|django|flask|react\b|vue\.?js|svelte|next\.js|express\b|node\.js|nodejs)\b/i.test(t);
}

function looksLikeFollowUpNotBuild(message: string): boolean {
  const t = String(message || '');
  if (/\b((make|do).{0,48}better|improv(e|ing|ements?)|what can (we|i) do|how can (we|i)|next steps?)\b/i.test(t)) {
    return true;
  }
  if (/\bwhat is this\b/i.test(t) || /\bexplain (this|the) (project|app|code)\b/i.test(t)) {
    return true;
  }
  if (/\b(debug this|look at this|inspect this|find the (bug|issue))\b/i.test(t)) return true;
  if (/\b(change|rename|update|set|make|turn|edit|switch)\b.{0,48}\b(background|color|title|name|text|label|header|button)\b/i.test(t)) {
    return true;
  }
  if (/\b(fix (it|them|this)|wire (it|up))\b/i.test(t)) return true;
  return false;
}

export function looksLikeMobileBuild(message: string): boolean {
  if (classifyMobileTarget(message)) return true;
  const t = String(message || '');
  if (!MOBILE_ASK_RE.test(t)) return false;
  return /\b(build|create|make|start|want|need)\b/i.test(t);
}

/** New product in an empty (or rebuild) Code folder — calculator, todo, game, app, … */
export function looksLikeNewAppBuild(message: string): boolean {
  const t = String(message || '');
  if (looksLikeFollowUpNotBuild(t)) return false;
  if (classifyMobileTarget(t) || looksLikeMobileBuild(t)) return true;
  if (BUILD_VERB_RE.test(t) && PRODUCT_RE.test(t)) return true;
  if (/\b(i )?(want|need)\s+(a|an|to (build|make|create))\b/i.test(t) && PRODUCT_RE.test(t)) return true;
  return false;
}

/** Ask Apple / Android / website before writing files. */
export function needsMobileTargetChoice(message: string): boolean {
  if (!looksLikeNewAppBuild(message)) return false;
  if (classifyMobileTarget(message)) return false;
  if (looksLikeWebsiteBuild(message)) return false;
  if (looksLikeKnownStack(message)) return false;
  return true;
}

export function inferMobileTargetFromFiles(files: Record<string, string> | undefined): MobileTarget | null {
  const keys = Object.keys(files || {});
  const ios = keys.some(p => /\.(swift|pbxproj)$/i.test(p));
  const android = keys.some(p => /\.(kt|kts)$/i.test(p) || /androidmanifest\.xml$/i.test(p));
  if (ios && android) return 'both';
  if (ios) return 'ios';
  if (android) return 'android';
  return null;
}

export function isNativeMobileTree(files: Record<string, string> | undefined): boolean {
  return inferMobileTargetFromFiles(files) != null;
}

export function mobileCodingRules(target: MobileTarget): string {
  const iterate = `When the project already has native files, patch Swift/Kotlin sources in place. Do not wipe ios/ or android/ unless they asked to start over. Keep Devices.design and preview sizes unless they pick a new device.`;
  if (target === 'ios') {
    return `This is a native iPhone/iPad app for the Apple App Store.
Write a real Xcode project: SwiftUI sources + MyApp.xcodeproj/project.pbxproj + Info.plist + Assets.xcassets.
Do NOT write index.html, css/, or js/ unless the user also asked for a website.
Paths live under ios/. A Mac opens ios/*.xcodeproj in Xcode to run and Archive.
If they name a device (iPhone 16, iPad Pro, etc.), lock Devices.design and Xcode #Preview to that size.
${iterate}`;
  }
  if (target === 'android') {
    return `This is a native Android app for Google Play.
Write a real Gradle/Kotlin project (Jetpack Compose): settings.gradle.kts, app/build.gradle.kts, AndroidManifest.xml, MainActivity.kt.
Do NOT write index.html unless they also asked for a website.
Paths live under android/. Android Studio opens the android/ folder.
${iterate}`;
  }
  return `This is one product on two native stacks.
Write BOTH:
- ios/ — SwiftUI + Xcode project (App Store)
- android/ — Kotlin/Compose + Gradle (Play Store)
Do NOT substitute a website. Same app name and idea on both sides.
${iterate}`;
}
