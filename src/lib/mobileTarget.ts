/**
 * Native phone target from chat: iOS (Xcode), Android (Studio), or both.
 */

export type MobileTarget = 'ios' | 'android' | 'both';

const IOS_RE =
  /\b(iphones?|ipads?|ipods?|ios|xcode|swiftui|app store|testflight|apple (app|device|phone|tablet)s?)\b/i;
const ANDROID_RE =
  /\b(android|samsung|galaxy|pixel|play store|google play|kotlin|jetpack compose)\b/i;
const MOBILE_ASK_RE =
  /\b(mobile app|phone app|smartphone|for (a |my |the )?phones?|native app)\b/i;

export function classifyMobileTarget(message: string): MobileTarget | null {
  const t = String(message || '');
  const ios = IOS_RE.test(t) || (/\bapple\b/i.test(t) && /\b(app|device|phone|store)\b/i.test(t));
  const android = ANDROID_RE.test(t);
  if (ios && android) return 'both';
  if (ios) return 'ios';
  if (android) return 'android';
  return null;
}

export function looksLikeMobileBuild(message: string): boolean {
  if (classifyMobileTarget(message)) return true;
  const t = String(message || '');
  if (!MOBILE_ASK_RE.test(t)) return false;
  return /\b(build|create|make|start|want|need)\b/i.test(t);
}

export function needsMobileTargetChoice(message: string): boolean {
  return looksLikeMobileBuild(message) && !classifyMobileTarget(message);
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
