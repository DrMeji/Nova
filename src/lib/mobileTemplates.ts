/**
 * Real Xcode (SwiftUI) and Android Studio (Kotlin/Compose) starters.
 * ARK authors the project; a Mac / Android Studio ships it.
 */

import { classifyMobileTarget, type MobileTarget } from '@/lib/mobileTarget';
import {
  deviceLine,
  isLayoutLockAsk,
  resolveDevices,
  type PhoneDevice,
} from '@/lib/mobileDevices';

type ParsedFileEdit = { path: string; content: string };

function productName(message: string, fallback = 'ArkApp') {
  const called = String(message || '').match(/\bcalled\s+([a-z0-9][a-z0-9 '-]{1,40})/i)?.[1];
  const raw = (called || fallback).replace(/[^a-zA-Z0-9]+/g, ' ').trim();
  const pascal = raw
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 40) || 'ArkApp';
  return /^[0-9]/.test(pascal) ? `App${pascal}` : pascal;
}

function bundleId(name: string) {
  return `com.ark.${name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24) || 'app'}`;
}

function pbxId(n: number) {
  return `A1${n.toString(16).toUpperCase().padStart(22, '0')}`;
}

function gitignore(): string {
  return `# iOS
xcuserdata/
DerivedData/
*.xcuserstate
*.xccheckout

# Android
.gradle/
**/build/
local.properties
*.iml
.idea/
.cxx/
`;
}

function readme(opts: {
  name: string;
  target: MobileTarget;
  bundle: string;
  ios?: PhoneDevice;
  android?: PhoneDevice;
}): string {
  const { name, target, bundle, ios, android } = opts;
  const wantIos = target === 'ios' || target === 'both';
  const wantAndroid = target === 'android' || target === 'both';
  const lines = [
    `# ${name}`,
    '',
    'Native phone app authored in ARK. This repo is the source — ship it from Xcode (Apple) or Android Studio (Play).',
    '',
  ];
  if (ios) lines.push(`Designed for **${deviceLine(ios)}**.`, '');
  if (android && android !== ios) lines.push(`Android layout: **${deviceLine(android)}**.`, '');
  if (wantIos) {
    lines.push(
      '## iPhone / iPad (App Store)',
      '',
      'Needs a Mac with Xcode. This Windows PC cannot compile or sign iOS — that is Apple’s rule.',
      '',
      '1. In ARK, tap **Push to GitHub**.',
      '2. On the Mac: `git clone` this repo and open `ios/' + name + '.xcodeproj`.',
      '3. Pick the ' + (ios?.label || 'iPhone') + ' simulator (or your device), then Run.',
      '4. Product → Archive → Distribute App → App Store Connect.',
      '',
      `Bundle ID: \`${bundle}\` (change it in Xcode before submitting).`,
      '',
    );
  }
  if (wantAndroid) {
    lines.push(
      '## Android (Play Store)',
      '',
      '1. In ARK, tap **Push to GitHub**.',
      '2. Clone on any PC. Open the `android` folder in Android Studio (File → Open). Let it generate the Gradle wrapper if asked.',
      '3. Run on a ' + (android?.label || 'phone') + ' emulator or a physical phone.',
      '4. Build → Generate Signed App Bundle / APK for Play Console.',
      '',
      `Application ID: \`${bundle}\`.`,
      '',
    );
  }
  lines.push(
    '## What ARK already did',
    '',
    'Project structure, screens, and the device size above are in the source.',
    'Icons, signing, and store listings are yours after clone.',
  );
  return `${lines.join('\n')}\n`;
}

function iosPbxproj(name: string, bundle: string): string {
  const id = {
    project: pbxId(1),
    target: pbxId(2),
    sources: pbxId(3),
    resources: pbxId(4),
    frameworks: pbxId(5),
    product: pbxId(6),
    appRef: pbxId(7),
    contentRef: pbxId(8),
    devicesRef: pbxId(9),
    plistRef: pbxId(10),
    assetsRef: pbxId(11),
    appBuild: pbxId(12),
    contentBuild: pbxId(13),
    devicesBuild: pbxId(14),
    assetsBuild: pbxId(15),
    rootGroup: pbxId(16),
    srcGroup: pbxId(17),
    productsGroup: pbxId(18),
    projCfgs: pbxId(19),
    targetCfgs: pbxId(20),
    debugProj: pbxId(21),
    releaseProj: pbxId(22),
    debugTarget: pbxId(23),
    releaseTarget: pbxId(24),
  };

  const sharedTarget = `GENERATE_INFOPLIST_FILE = YES;
				INFOPLIST_FILE = ${name}/Info.plist;
				INFOPLIST_KEY_CFBundleDisplayName = ${name};
				INFOPLIST_KEY_UIApplicationSceneManifest_Generation = YES;
				INFOPLIST_KEY_UILaunchScreen_Generation = YES;
				LD_RUNPATH_SEARCH_PATHS = "$(inherited) @executable_path/Frameworks";
				MARKETING_VERSION = 1.0;
				CURRENT_PROJECT_VERSION = 1;
				PRODUCT_BUNDLE_IDENTIFIER = ${bundle};
				PRODUCT_NAME = "$(TARGET_NAME)";
				SDKROOT = iphoneos;
				SWIFT_EMIT_LOC_STRINGS = YES;
				SWIFT_VERSION = 5.0;
				TARGETED_DEVICE_FAMILY = "1,2";
				IPHONEOS_DEPLOYMENT_TARGET = 17.0;`;

  return `// !$*UTF8*$!
{
	archiveVersion = 1;
	classes = {
	};
	objectVersion = 56;
	objects = {
		${id.appBuild} /* ${name}App.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${id.appRef} /* ${name}App.swift */; };
		${id.contentBuild} /* ContentView.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${id.contentRef} /* ContentView.swift */; };
		${id.devicesBuild} /* Devices.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${id.devicesRef} /* Devices.swift */; };
		${id.assetsBuild} /* Assets.xcassets in Resources */ = {isa = PBXBuildFile; fileRef = ${id.assetsRef} /* Assets.xcassets */; };
		${id.product} /* ${name}.app */ = {isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = ${name}.app; sourceTree = BUILT_PRODUCTS_DIR; };
		${id.appRef} /* ${name}App.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ${name}App.swift; sourceTree = "<group>"; };
		${id.contentRef} /* ContentView.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ContentView.swift; sourceTree = "<group>"; };
		${id.devicesRef} /* Devices.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = Devices.swift; sourceTree = "<group>"; };
		${id.plistRef} /* Info.plist */ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = Info.plist; sourceTree = "<group>"; };
		${id.assetsRef} /* Assets.xcassets */ = {isa = PBXFileReference; lastKnownFileType = folder.assetcatalog; path = Assets.xcassets; sourceTree = "<group>"; };
		${id.frameworks} /* Frameworks */ = {
			isa = PBXFrameworksBuildPhase;
			buildActionMask = 2147483647;
			files = (
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
		${id.rootGroup} = {
			isa = PBXGroup;
			children = (
				${id.srcGroup} /* ${name} */,
				${id.productsGroup} /* Products */,
			);
			sourceTree = "<group>";
		};
		${id.srcGroup} /* ${name} */ = {
			isa = PBXGroup;
			children = (
				${id.appRef} /* ${name}App.swift */,
				${id.contentRef} /* ContentView.swift */,
				${id.devicesRef} /* Devices.swift */,
				${id.assetsRef} /* Assets.xcassets */,
				${id.plistRef} /* Info.plist */,
			);
			path = ${name};
			sourceTree = "<group>";
		};
		${id.productsGroup} /* Products */ = {
			isa = PBXGroup;
			children = (
				${id.product} /* ${name}.app */,
			);
			name = Products;
			sourceTree = "<group>";
		};
		${id.target} /* ${name} */ = {
			isa = PBXNativeTarget;
			buildConfigurationList = ${id.targetCfgs} /* Build configuration list for PBXNativeTarget "${name}" */;
			buildPhases = (
				${id.sources} /* Sources */,
				${id.frameworks} /* Frameworks */,
				${id.resources} /* Resources */,
			);
			buildRules = (
			);
			dependencies = (
			);
			name = ${name};
			productName = ${name};
			productReference = ${id.product} /* ${name}.app */;
			productType = "com.apple.product-type.application";
		};
		${id.project} /* Project object */ = {
			isa = PBXProject;
			attributes = {
				BuildIndependentTargetsInParallel = 1;
				LastSwiftUpdateCheck = 1500;
				LastUpgradeCheck = 1500;
				TargetAttributes = {
					${id.target} = {
						CreatedOnToolsVersion = 15.0;
					};
				};
			};
			buildConfigurationList = ${id.projCfgs} /* Build configuration list for PBXProject "${name}" */;
			compatibilityVersion = "Xcode 14.0";
			developmentRegion = en;
			hasScannedForEncodings = 0;
			knownRegions = (
				en,
				Base,
			);
			mainGroup = ${id.rootGroup};
			productRefGroup = ${id.productsGroup} /* Products */;
			projectDirPath = "";
			projectRoot = "";
			targets = (
				${id.target} /* ${name} */,
			);
		};
		${id.resources} /* Resources */ = {
			isa = PBXResourcesBuildPhase;
			buildActionMask = 2147483647;
			files = (
				${id.assetsBuild} /* Assets.xcassets in Resources */,
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
		${id.sources} /* Sources */ = {
			isa = PBXSourcesBuildPhase;
			buildActionMask = 2147483647;
			files = (
				${id.appBuild} /* ${name}App.swift in Sources */,
				${id.contentBuild} /* ContentView.swift in Sources */,
				${id.devicesBuild} /* Devices.swift in Sources */,
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
		${id.debugProj} /* Debug */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				ALWAYS_SEARCH_USER_PATHS = NO;
				CLANG_ENABLE_MODULES = YES;
				CLANG_ENABLE_OBJC_ARC = YES;
				COPY_PHASE_STRIP = NO;
				DEBUG_INFORMATION_FORMAT = dwarf;
				ENABLE_TESTABILITY = YES;
				GCC_DYNAMIC_NO_PIC = NO;
				IPHONEOS_DEPLOYMENT_TARGET = 17.0;
				MTL_ENABLE_DEBUG_INFO = INCLUDE_SOURCE;
				ONLY_ACTIVE_ARCH = YES;
				SDKROOT = iphoneos;
				SWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG;
				SWIFT_OPTIMIZATION_LEVEL = "-Onone";
			};
			name = Debug;
		};
		${id.releaseProj} /* Release */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				ALWAYS_SEARCH_USER_PATHS = NO;
				CLANG_ENABLE_MODULES = YES;
				CLANG_ENABLE_OBJC_ARC = YES;
				COPY_PHASE_STRIP = NO;
				DEBUG_INFORMATION_FORMAT = "dwarf-with-dsym";
				IPHONEOS_DEPLOYMENT_TARGET = 17.0;
				MTL_ENABLE_DEBUG_INFO = NO;
				SDKROOT = iphoneos;
				SWIFT_COMPILATION_MODE = wholemodule;
				SWIFT_OPTIMIZATION_LEVEL = "-O";
				VALIDATE_PRODUCT = YES;
			};
			name = Release;
		};
		${id.debugTarget} /* Debug */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;
				ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = AccentColor;
				CODE_SIGN_STYLE = Automatic;
				DEVELOPMENT_TEAM = "";
				ENABLE_PREVIEWS = YES;
				${sharedTarget}
			};
			name = Debug;
		};
		${id.releaseTarget} /* Release */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;
				ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME = AccentColor;
				CODE_SIGN_STYLE = Automatic;
				DEVELOPMENT_TEAM = "";
				ENABLE_PREVIEWS = YES;
				${sharedTarget}
			};
			name = Release;
		};
		${id.projCfgs} /* Build configuration list for PBXProject "${name}" */ = {
			isa = XCConfigurationList;
			buildConfigurations = (
				${id.debugProj} /* Debug */,
				${id.releaseProj} /* Release */,
			);
			defaultConfigurationIsVisible = 0;
			defaultConfigurationName = Release;
		};
		${id.targetCfgs} /* Build configuration list for PBXNativeTarget "${name}" */ = {
			isa = XCConfigurationList;
			buildConfigurations = (
				${id.debugTarget} /* Debug */,
				${id.releaseTarget} /* Release */,
			);
			defaultConfigurationIsVisible = 0;
			defaultConfigurationName = Release;
		};
	};
	rootObject = ${id.project} /* Project object */;
}
`;
}

function iosFiles(name: string, bundle: string, idea: string, device: PhoneDevice): ParsedFileEdit[] {
  const prefix = `ios/${name}`;
  return [
    {
      path: `ios/${name}.xcodeproj/project.pbxproj`,
      content: iosPbxproj(name, bundle),
    },
    {
      path: `${prefix}/${name}App.swift`,
      content: `import SwiftUI

@main
struct ${name}App: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
`,
    },
    {
      path: `${prefix}/ContentView.swift`,
      content: `import SwiftUI

/// Layout canvas: ${device.label} (${device.width}×${device.height} ${device.unit}). See Devices.design.
struct ContentView: View {
    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Text(${JSON.stringify(idea.slice(0, 80) || name)})
                    .font(.title2.weight(.semibold))
                    .multilineTextAlignment(.center)
                Text(${JSON.stringify(deviceLine(device))})
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Spacer()
            }
            .padding()
            .frame(maxWidth: Devices.design.width, maxHeight: Devices.design.height)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .navigationTitle(${JSON.stringify(name)})
        }
    }
}

#Preview(${JSON.stringify(device.label)}) {
    ContentView()${device.xcodePreview ? `\n        .previewDevice(PreviewDevice(rawValue: ${JSON.stringify(device.xcodePreview)}))` : ''}
}
`,
    },
    {
      path: `${prefix}/Devices.swift`,
      content: `import CoreGraphics

/// Design canvas locked in ARK. Change Devices.design or ask chat to lock another size.
enum Devices {
    static let design = CGSize(width: ${device.width}, height: ${device.height})
    static let iPhoneSE = CGSize(width: 375, height: 667)
    static let iPhone16 = CGSize(width: 393, height: 852)
    static let iPhone16ProMax = CGSize(width: 440, height: 956)
    static let iPadMini = CGSize(width: 744, height: 1133)
    static let iPadPro11 = CGSize(width: 834, height: 1194)
    static let iPadPro13 = CGSize(width: 1024, height: 1366)
    static let mac14 = CGSize(width: 1440, height: 900)
}
`,
    },
    {
      path: `${prefix}/Info.plist`,
      content: `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDisplayName</key>
	<string>${name}</string>
	<key>UILaunchScreen</key>
	<dict/>
</dict>
</plist>
`,
    },
    {
      path: `${prefix}/Assets.xcassets/Contents.json`,
      content: `{
  "info" : { "author" : "xcode", "version" : 1 }
}
`,
    },
    {
      path: `${prefix}/Assets.xcassets/AccentColor.colorset/Contents.json`,
      content: `{
  "colors" : [ { "idiom" : "universal" } ],
  "info" : { "author" : "xcode", "version" : 1 }
}
`,
    },
    {
      path: `${prefix}/Assets.xcassets/AppIcon.appiconset/Contents.json`,
      content: `{
  "images" : [ { "idiom" : "universal", "platform" : "ios", "size" : "1024x1024" } ],
  "info" : { "author" : "xcode", "version" : 1 }
}
`,
    },
  ];
}

function androidFiles(name: string, bundle: string, idea: string, device: PhoneDevice): ParsedFileEdit[] {
  const pkgPath = bundle.replace(/\./g, '/');
  const pkg = bundle;
  return [
    {
      path: 'android/settings.gradle.kts',
      content: `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = ${JSON.stringify(name)}
include(":app")
`,
    },
    {
      path: 'android/build.gradle.kts',
      content: `plugins {
    id("com.android.application") version "8.5.2" apply false
    id("org.jetbrains.kotlin.android") version "1.9.24" apply false
}
`,
    },
    {
      path: 'android/gradle.properties',
      content: `org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
kotlin.code.style=official
android.nonTransitiveRClass=true
`,
    },
    {
      path: 'android/app/build.gradle.kts',
      content: `plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = ${JSON.stringify(pkg)}
    compileSdk = 34
    defaultConfig {
        applicationId = ${JSON.stringify(pkg)}
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { compose = true }
    composeOptions { kotlinCompilerExtensionVersion = "1.5.14" }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.06.00")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.activity:activity-compose:1.9.0")
    implementation("androidx.core:core-ktx:1.13.1")
    debugImplementation("androidx.compose.ui:ui-tooling")
}
`,
    },
    {
      path: 'android/app/proguard-rules.pro',
      content: '# Add Play / R8 rules here when you ship a release bundle.\n',
    },
    {
      path: 'android/app/src/main/AndroidManifest.xml',
      content: `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application
        android:allowBackup="true"
        android:label="@string/app_name"
        android:supportsRtl="true"
        android:theme="@style/Theme.${name}">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:theme="@style/Theme.${name}">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`,
    },
    {
      path: `android/app/src/main/java/${pkgPath}/MainActivity.kt`,
      content: `package ${pkg}

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
@Composable
fun AppRoot() {
    MaterialTheme {
        Surface(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier.fillMaxSize().padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.Top),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(${JSON.stringify(name)}, style = MaterialTheme.typography.headlineSmall)
                Text(${JSON.stringify(idea.slice(0, 80) || 'Android app')}, style = MaterialTheme.typography.bodyMedium)
                Text(${JSON.stringify(deviceLine(device))}, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Preview(showBackground = true, widthDp = ${device.width}, heightDp = ${device.height}, name = ${JSON.stringify(device.label)})
@Composable
fun PreviewApp() {
    AppRoot()
}
`,
    },
    {
      path: 'android/app/src/main/res/values/strings.xml',
      content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">${name}</string>
</resources>
`,
    },
    {
      path: 'android/app/src/main/res/values/themes.xml',
      content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="Theme.${name}" parent="android:Theme.Material.Light.NoActionBar" />
</resources>
`,
    },
    {
      path: 'android/app/src/main/res/values/dimens.xml',
      content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <dimen name="design_width">${device.width}dp</dimen>
    <dimen name="design_height">${device.height}dp</dimen>
    <dimen name="phone_width">360dp</dimen>
    <dimen name="phone_height">800dp</dimen>
    <dimen name="tablet_width">800dp</dimen>
    <dimen name="tablet_height">1280dp</dimen>
</resources>
`,
    },
  ];
}

function ideaFromMessage(message: string, name: string) {
  const t = String(message || '')
    .replace(/\n+/g, ' ')
    .replace(/build this as a native.*/i, '')
    .trim();
  if (t.length > 12) return t.slice(0, 120);
  return `${name} phone app`;
}

function htmlEscape(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function previewHtml(name: string, idea: string, device: PhoneDevice): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${htmlEscape(name)}</title>
<style>
  html,body{margin:0;height:100%;background:#070b14;color:#e8eef8;font-family:ui-sans-serif,system-ui,sans-serif}
  .wrap{min-height:100%;padding:28px 22px;display:flex;flex-direction:column;box-sizing:border-box}
  .kicker{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#7dd3fc;opacity:.9}
  h1{font-size:22px;margin:14px 0 8px;font-weight:650}
  p{color:#94a3b8;line-height:1.45;font-size:14px;margin:0}
  .cta{margin-top:auto;background:#38bdf8;color:#0b1220;border:0;border-radius:999px;padding:12px 18px;font-weight:650;font-size:14px}
</style>
</head>
<body>
  <div class="wrap">
    <div class="kicker">${htmlEscape(device.label)}</div>
    <h1>${htmlEscape(name)}</h1>
    <p>${htmlEscape(idea)}</p>
    <button class="cta" type="button">Continue</button>
  </div>
</body>
</html>
`;
}

export function planMobileFiles(target: MobileTarget, message: string, projectName?: string): string[] {
  return mobileTemplateEdits(target, message, projectName).map(e => e.path);
}

export function mobileTemplateEdits(
  target: MobileTarget,
  message: string,
  projectName?: string,
): ParsedFileEdit[] {
  const name = productName(message, projectName || 'ArkApp');
  const bundle = bundleId(name);
  const idea = ideaFromMessage(message, name);
  const devices = resolveDevices(target, message);
  const edits: ParsedFileEdit[] = [
    { path: '.gitignore', content: gitignore() },
    { path: 'README.md', content: readme({ name, target, bundle, ios: devices.ios, android: devices.android }) },
    { path: 'ark-preview.html', content: previewHtml(name, idea, devices.ios || devices.android!) },
  ];
  if (target === 'ios' || target === 'both') {
    edits.push(...iosFiles(name, bundle, idea, devices.ios!));
  }
  if (target === 'android' || target === 'both') {
    edits.push(...androidFiles(name, bundle, idea, devices.android!));
  }
  return edits;
}

function iosAppDir(files: Record<string, string>) {
  const hit = Object.keys(files).find(p => /ios\/[^/]+\/ContentView\.swift$/i.test(p));
  return hit ? hit.replace(/\/ContentView\.swift$/i, '') : null;
}

function androidMainActivity(files: Record<string, string>) {
  return Object.keys(files).find(p => /MainActivity\.kt$/i.test(p)) || null;
}

/** Patch canvas size without regenerating the whole app. */
export function layoutLockEdits(
  files: Record<string, string>,
  message: string,
  target: MobileTarget,
): ParsedFileEdit[] {
  const devices = resolveDevices(target, message);
  const out: ParsedFileEdit[] = [];
  const iosDir = iosAppDir(files);
  if (devices.ios && iosDir && files[`${iosDir}/Devices.swift`]) {
    const d = devices.ios;
    out.push({
      path: `${iosDir}/Devices.swift`,
      content: `import CoreGraphics

enum Devices {
    static let design = CGSize(width: ${d.width}, height: ${d.height})
    static let iPhoneSE = CGSize(width: 375, height: 667)
    static let iPhone16 = CGSize(width: 393, height: 852)
    static let iPhone16ProMax = CGSize(width: 440, height: 956)
    static let iPadMini = CGSize(width: 744, height: 1133)
    static let iPadPro11 = CGSize(width: 834, height: 1194)
    static let iPadPro13 = CGSize(width: 1024, height: 1366)
    static let mac14 = CGSize(width: 1440, height: 900)
}
`,
    });
    const view = files[`${iosDir}/ContentView.swift`] || '';
    if (view) {
      out.push({
        path: `${iosDir}/ContentView.swift`,
        content: view
          .replace(/Text\("[^"]*·[^"]*"\)/, `Text(${JSON.stringify(deviceLine(d))})`)
          .replace(/#Preview\("[^"]*"\)/, `#Preview(${JSON.stringify(d.label)})`)
          .replace(
            /PreviewDevice\(rawValue: "[^"]*"\)/,
            `PreviewDevice(rawValue: ${JSON.stringify(d.xcodePreview || d.label)})`,
          ),
      });
    }
  }
  const activity = androidMainActivity(files);
  if (devices.android && activity && files[activity]) {
    const d = devices.android;
    out.push({
      path: activity,
      content: files[activity]
        .replace(/widthDp\s*=\s*\d+/g, `widthDp = ${d.width}`)
        .replace(/heightDp\s*=\s*\d+/g, `heightDp = ${d.height}`)
        .replace(/name\s*=\s*"[^"]*"/, `name = ${JSON.stringify(d.label)}`),
    });
    if (files['android/app/src/main/res/values/dimens.xml']) {
      out.push({
        path: 'android/app/src/main/res/values/dimens.xml',
        content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <dimen name="design_width">${d.width}dp</dimen>
    <dimen name="design_height">${d.height}dp</dimen>
    <dimen name="phone_width">360dp</dimen>
    <dimen name="phone_height">800dp</dimen>
    <dimen name="tablet_width">800dp</dimen>
    <dimen name="tablet_height">1280dp</dimen>
</resources>
`,
      });
    }
  }
  return out;
}

export function formatNativeBuildReply(label: string, message: string, files: Record<string, string>): string {
  const target = classifyMobileTarget(message)
    || (Object.keys(files).some(p => p.endsWith('.swift')) && Object.keys(files).some(p => p.endsWith('.kt'))
      ? 'both'
      : Object.keys(files).some(p => p.endsWith('.swift'))
        ? 'ios'
        : 'android');
  const devices = resolveDevices(target, message);
  const size = devices.ios ? deviceLine(devices.ios) : devices.android ? deviceLine(devices.android) : '';
  const ios = target === 'ios' || target === 'both';
  const android = target === 'android' || target === 'both';
  return [
    `I wrote a native **${label}**${size ? ` for ${size}` : ''}.`,
    '',
    'This is not a website in a browser — Start shows a device-sized preview in ARK.',
    ios ? 'On a Mac: clone from GitHub and open `ios/*.xcodeproj` in Xcode, then Archive for the App Store.' : '',
    android ? 'Anywhere: open the `android` folder in Android Studio, then ship an AAB to Play Console.' : '',
    '',
    'Tap **Push to GitHub** when you want the repo on the other machine. Use the size chips if you want a different phone or tablet canvas.',
  ].filter(Boolean).join('\n');
}

export function formatNativePushReply(remote: string, files: Record<string, string>): string {
  const https = remote.replace(/git@github\.com:/, 'https://github.com/').replace(/\.git$/, '');
  const ios = Object.keys(files).some(p => /\.swift$|\.pbxproj$/i.test(p));
  const android = Object.keys(files).some(p => /\.kt$|androidmanifest/i.test(p));
  return [
    `Pushed to GitHub.`,
    https ? `Repo: ${https}` : '',
    '',
    ios ? `Mac: git clone ${https || 'the repo'} && open ios/*.xcodeproj` : '',
    android ? `Android Studio: File → Open → android/` : '',
  ].filter(Boolean).join('\n');
}

function isWebOnly(edits: ParsedFileEdit[]) {
  if (!edits.length) return true;
  return edits.every(e =>
    /\.(html?|css|js|mjs)$/i.test(e.path) || /^(index\.html|css\/|js\/)/i.test(e.path),
  );
}

function hasNative(edits: ParsedFileEdit[]) {
  return edits.some(e =>
    /\.(swift|pbxproj|kt|kts)$/i.test(e.path) || /androidmanifest\.xml$/i.test(e.path),
  );
}

/** If chat asked for a store app but the brain returned a website, use the native template. */
export function finalizeMobileEdits(
  message: string,
  edits: ParsedFileEdit[],
  files?: Record<string, string>,
): ParsedFileEdit[] {
  const target = classifyMobileTarget(message);
  if (!target) return edits;
  if (isLayoutLockAsk(message) && files && Object.keys(files).length) {
    const locked = layoutLockEdits(files, message, target);
    if (locked.length) return locked;
  }
  if (!hasNative(edits) || isWebOnly(edits)) {
    return mobileTemplateEdits(target, message);
  }
  return edits;
}

export function preferredMobileFocus(paths: string[]): string | undefined {
  return paths.find(p => p.endsWith('ContentView.swift'))
    || paths.find(p => p.endsWith('MainActivity.kt'))
    || paths.find(p => p.endsWith('.swift') || p.endsWith('.kt'))
    || paths[0];
}
