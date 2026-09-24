/**
 * Real Xcode (SwiftUI) and Android Studio (Kotlin/Compose) starters.
 * NOVA authors the project; a Mac / Android Studio ships it.
 */

import { classifyMobileTarget, type MobileTarget } from '@/lib/mobileTarget';
import {
  classifyMobileDevice,
  deviceLine,
  isLayoutLockAsk,
  resolveDevices,
  type PhoneDevice,
} from '@/lib/mobileDevices';

type ParsedFileEdit = { path: string; content: string };

function productName(message: string, fallback = 'NovaApp', files?: Record<string, string>) {
  const existing = files
    ? Object.keys(files).find(p => /ios\/[^/]+\/ContentView\.swift$/i.test(p))?.split('/')[1]
    : undefined;
  if (existing) return existing;
  const called = String(message || '').match(/\bcalled\s+([a-z0-9][a-z0-9 '-]{1,40})/i)?.[1];
  const raw = (called || fallback).replace(/[^a-zA-Z0-9]+/g, ' ').trim();
  const pascal = raw
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 40) || 'NovaApp';
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
    'Native phone app authored in NOVA. This repo is the source. ship it from Xcode (Apple) or Android Studio (Play).',
    '',
  ];
  if (ios) lines.push(`Designed for **${deviceLine(ios)}**.`, '');
  if (android && android !== ios) lines.push(`Android layout: **${deviceLine(android)}**.`, '');
  if (wantIos) {
    lines.push(
      '## iPhone / iPad (App Store)',
      '',
      'Needs a Mac with Xcode. This Windows PC cannot compile or sign iOS. that is Apple’s rule.',
      '',
      '1. In NOVA, tap **Push to GitHub**.',
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
      '1. In NOVA, tap **Push to GitHub**.',
      '2. Clone on any PC. Open the `android` folder in Android Studio (File → Open). Let it generate the Gradle wrapper if asked.',
      '3. Run on a ' + (android?.label || 'phone') + ' emulator or a physical phone.',
      '4. Build → Generate Signed App Bundle / APK for Play Console.',
      '',
      `Application ID: \`${bundle}\`.`,
      '',
    );
  }
  lines.push(
    '## What NOVA already did',
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
      content: wantsCalculator(idea, name)
        ? calculatorSwift(name, device)
        : `import SwiftUI

/// Layout canvas: ${device.label} (${device.width}×${device.height} ${device.unit}). See Devices.design.
struct ContentView: View {
    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Text(${JSON.stringify(name)})
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
            .background(Color(red: 0.03, green: 0.04, blue: 0.08))
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

/// Design canvas locked in NOVA. Change Devices.design or ask chat to lock another size.
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
        setContent { AppRoot() }
    }
}

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
                Text(${JSON.stringify(idea)}, style = MaterialTheme.typography.bodyMedium)
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
  if (/\bcalculator\b/i.test(message)) return 'Basic calculator';
  return name;
}

function wantsCalculator(message: string, name: string) {
  return /\bcalculator\b/i.test(message) || /^calculator$/i.test(name);
}

function calculatorSwift(name: string, device: PhoneDevice): string {
  return `import SwiftUI

/// Layout canvas: ${device.label} (${device.width}×${device.height} ${device.unit}). See Devices.design.
struct ContentView: View {
    @State private var display = "0"

    let keys = [
        ["C", "÷", "×", "−"],
        ["7", "8", "9", "+"],
        ["4", "5", "6", "="],
        ["1", "2", "3", "0"],
    ]

    var body: some View {
        VStack(spacing: 12) {
            Text(${JSON.stringify(device.label)})
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(display)
                .font(.system(size: 42, weight: .semibold, design: .rounded))
                .frame(maxWidth: .infinity, alignment: .trailing)
                .padding(.horizontal, 8)
            ForEach(keys, id: \\.self) { row in
                HStack(spacing: 10) {
                    ForEach(row, id: \\.self) { key in
                        Button(key) { tap(key) }
                            .frame(maxWidth: .infinity, minHeight: 56)
                            .background(op(key) ? Color.orange : Color(white: 0.18))
                            .foregroundStyle(op(key) ? Color.black : Color.white)
                            .clipShape(Capsule())
                    }
                }
            }
        }
        .padding()
        .frame(maxWidth: Devices.design.width, maxHeight: Devices.design.height)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.black)
    }

    func op(_ key: String) -> Bool { ["C","÷","×","−","+","="].contains(key) }

    func tap(_ key: String) {
        if key == "C" { display = "0"; return }
        if key == "=" {
            let expr = display.replacingOccurrences(of: "÷", with: "/").replacingOccurrences(of: "×", with: "*").replacingOccurrences(of: "−", with: "-")
            display = NSExpression(format: expr).expressionValue(with: nil, context: nil).map { "\\($0)" } ?? display
            return
        }
        display = display == "0" ? key : display + key
    }
}

#Preview(${JSON.stringify(device.label)}) {
    ContentView()${device.xcodePreview ? `\n        .previewDevice(PreviewDevice(rawValue: ${JSON.stringify(device.xcodePreview)}))` : ''}
}
`;
}

function htmlEscape(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function previewHtml(name: string, idea: string, device: PhoneDevice): string {
  if (wantsCalculator('', name) || /calculator/i.test(idea)) {
    return calculatorPreviewHtml(name, device);
  }
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
    <div class="kicker">${htmlEscape(deviceLine(device))}</div>
    <h1>${htmlEscape(name)}</h1>
    <p>${htmlEscape(idea)}</p>
    <button class="cta" type="button">Continue</button>
  </div>
</body>
</html>
`;
}

function calculatorPreviewHtml(name: string, device: PhoneDevice): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${htmlEscape(name)}</title>
<style>
  html,body{margin:0;height:100%;background:#050608;color:#f8fafc;font-family:ui-sans-serif,system-ui,sans-serif}
  .shell{min-height:100%;display:flex;flex-direction:column;padding:18px 14px 22px;box-sizing:border-box}
  .kicker{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#94a3b8}
  .screen{margin:18px 4px 16px;font-size:42px;font-weight:650;text-align:right;min-height:52px;word-break:break-all}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:auto}
  button{border:0;border-radius:999px;height:58px;font-size:22px;font-weight:600;cursor:pointer;color:#f8fafc;background:#27272a}
  button.op{background:#f59e0b;color:#111}
  button.eq{background:#38bdf8;color:#082f49}
  button.wide{grid-column:span 2}
</style>
</head>
<body>
  <div class="shell">
    <div class="kicker">${htmlEscape(deviceLine(device))}</div>
    <div class="screen" id="out">0</div>
    <div class="grid">
      ${['C','÷','×','-','7','8','9','+','4','5','6','=','1','2','3','0'].map(key => {
        const cls = key === '=' ? 'eq' : /[÷×+\-]/.test(key) ? 'op' : key === '0' ? 'wide' : '';
        return `<button class="${cls}" data-k="${key}">${key === '0' ? '0' : key}</button>`;
      }).join('')}
    </div>
  </div>
  <script>
    const out = document.getElementById('out');
    let cur = '0';
    document.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
      const k = btn.getAttribute('data-k');
      if (k === 'C') { cur = '0'; }
      else if (k === '=') {
        try { cur = String(eval(cur.replace(/÷/g,'/').replace(/×/g,'*'))); }
        catch { cur = 'Error'; }
      } else {
        cur = (cur === '0' || cur === 'Error') ? k : cur + k;
      }
      out.textContent = cur;
    }));
  </script>
</body>
</html>
`;
}

export function planMobileFiles(target: MobileTarget, message: string, projectName?: string): string[] {
  return mobileTemplateEdits(target, message, projectName).map(e => e.path);
}

export function mobileTemplateEdits(
  _target: MobileTarget,
  _message: string,
  _projectName?: string,
  _files?: Record<string, string>,
): ParsedFileEdit[] {
  // Never invent a full iOS/Android app from a canned template.
  // Model must write native files; layoutLockEdits can still patch an existing tree.
  return [];
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
          .replace(/Text\("(iPhone|iPad|Mac|Pixel|Galaxy)[^"]*"\)/, `Text(${JSON.stringify(d.label)})`)
          .replace(/#Preview\("[^"]*"\)/, `#Preview(${JSON.stringify(d.label)})`)
          .replace(
            /PreviewDevice\(rawValue: "[^"]*"\)/,
            `PreviewDevice(rawValue: ${JSON.stringify(d.xcodePreview || d.label)})`,
          ),
      });
    }
    const previewName = iosDir.split('/')[1] || 'App';
    const existingPreview = files['nova-preview.html'];
    if (existingPreview) {
      const kicker = htmlEscape(deviceLine(d));
      const next = existingPreview
        .replace(/<div class="kicker">[^<]*<\/div>/, `<div class="kicker">${kicker}</div>`)
        .replace(/IPHONE\s*1[0-9](?:\s+PRO\s+MAX)?[^<]*/i, kicker);
      out.push({ path: 'nova-preview.html', content: next });
    } else {
      out.push({
        path: 'nova-preview.html',
        content: previewHtml(previewName, ideaFromMessage(message, previewName), d),
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
    'This is not a website in a browser. Start shows a device-sized preview in NOVA.',
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

function remapNativeEdits(edits: ParsedFileEdit[], files: Record<string, string>): ParsedFileEdit[] {
  const iosDir = iosAppDir(files);
  if (!iosDir) return edits;
  const prefix = iosDir; // ios/ExistingName
  return edits.map(e => {
    const path = e.path.replace(/\\/g, '/');
    if (/^ios\/[^/]+\//.test(path) && !path.includes('.xcodeproj')) {
      return { ...e, path: path.replace(/^ios\/[^/]+/, prefix) };
    }
    return e;
  });
}

function swiftColor(name: string): string | null {
  if (/black|dark/i.test(name)) return 'Color.black';
  if (/white/i.test(name)) return 'Color.white';
  if (/blue/i.test(name)) return 'Color.blue';
  if (/red/i.test(name)) return 'Color.red';
  if (/green/i.test(name)) return 'Color.green';
  return null;
}

function cssColor(name: string): string | null {
  if (/black|dark/i.test(name)) return '#000000';
  if (/white/i.test(name)) return '#ffffff';
  if (/blue/i.test(name)) return '#2563eb';
  if (/red/i.test(name)) return '#dc2626';
  if (/green/i.test(name)) return '#16a34a';
  return null;
}

function contrastTextForBg(bg: string): string {
  const dark = /#0|#1|#2|black|dark/i.test(bg);
  const light = /#f|#e|white/i.test(bg);
  if (dark) return '#f5f7fb';
  if (light) return '#111827';
  return '#e8eefc';
}

function patchWebBodyColors(css: string, bg: string, fg: string): string {
  let next = css;
  if (/body\s*\{[^}]*background(?:-color)?\s*:/i.test(next)) {
    next = next.replace(/(body\s*\{[^}]*?)background(?:-color)?\s*:\s*[^;]+/i, `$1background: ${bg}`);
  } else if (/body\s*\{/i.test(next)) {
    next = next.replace(/body\s*\{/i, `body {\n  background: ${bg};`);
  } else {
    next = `body { background: ${bg}; color: ${fg}; }\n${next}`;
  }
  if (/body\s*\{[^}]*\bcolor\s*:/i.test(next)) {
    next = next.replace(/(body\s*\{[^}]*?)\bcolor\s*:\s*[^;]+/i, `$1color: ${fg}`);
  } else if (/body\s*\{/i.test(next)) {
    next = next.replace(/body\s*\{/i, `body {\n  color: ${fg};`);
  }
  if (/h1\s*\{[^}]*\bcolor\s*:/i.test(next)) {
    next = next.replace(/(h1\s*\{[^}]*?)\bcolor\s*:\s*[^;]+/i, `$1color: ${fg}`);
  }
  return next;
}

/** Cheap local patches so “change the background” doesn’t spawn a new app folder. */
export function simpleVisualPatchEdits(files: Record<string, string>, message: string): ParsedFileEdit[] {
  const out: ParsedFileEdit[] = [];
  const t = String(message || '');
  const iosDir = iosAppDir(files);
  const viewPath = iosDir ? `${iosDir}/ContentView.swift` : null;
  const colorWord = t.match(/\b(black|white|blue|dark|red|green)\b/i)?.[1];
  const wantsBg = /\bbackground\b/i.test(t) && Boolean(colorWord);
  const wantsTextColor = /\b(text|words?|title|heading|hello\s*world)\b.{0,40}\b(white|black|color)\b|\b(white|black)\s+(color|text)\b/i.test(t);
  const renameTo = t.match(/(?:change|rename|set|into).{0,48}(?:to|into)\s+["']?([A-Za-z0-9][A-Za-z0-9 .+-]{1,40})/i)?.[1]?.trim()
    || t.match(/(?:saying|say)\s+["']?([A-Za-z0-9][A-Za-z0-9 .+-]{1,40})/i)?.[1]?.trim();

  if (wantsBg && colorWord && viewPath && files[viewPath]) {
    const color = swiftColor(colorWord);
    if (color) {
      let view = files[viewPath];
      if (/\.background\(Color\.(black|white|clear)\)/.test(view)) {
        view = view.replace(/\.background\(Color\.(black|white|clear)\)/, `.background(${color})`);
      } else if (/\.background\(Color\(red:[^)]*\)\)/.test(view)) {
        view = view.replace(/\.background\(Color\(red:[^)]*\)\)/, `.background(${color})`);
      } else {
        view = view.replace(
          /(\.frame\(maxWidth: \.infinity, maxHeight: \.infinity\))/,
          `$1\n            .background(${color})`,
        );
      }
      out.push({ path: viewPath, content: view });
    }
  }

  const htmlColor = colorWord ? cssColor(colorWord) : null;
  if ((wantsBg || wantsTextColor) && htmlColor) {
    const fg = wantsTextColor && /\bwhite\b/i.test(t)
      ? '#ffffff'
      : wantsTextColor && /\bblack\b/i.test(t) && !wantsBg
        ? '#111827'
        : contrastTextForBg(htmlColor);
    if (files['nova-preview.html']) {
      out.push({
        path: 'nova-preview.html',
        content: files['nova-preview.html']
          .replace(/background(?:-color)?:\s*#[0-9a-fA-F]{3,8}/gi, `background:${htmlColor}`)
          .replace(/\bcolor\s*:\s*#[0-9a-fA-F]{3,8}/gi, `color:${fg}`),
      });
    }
    if (files['index.html']) {
      const html = files['index.html'].replace(/background(?:-color)?:\s*[^;]+/gi, `background: ${htmlColor}`);
      out.push({ path: 'index.html', content: html });
    }
    const cssPath = Object.keys(files).find(p => /styles?\.css$/i.test(p) || /index\.css$/i.test(p));
    if (cssPath && files[cssPath]) {
      out.push({ path: cssPath, content: patchWebBodyColors(files[cssPath], htmlColor, fg) });
    }
  }

  if (renameTo && viewPath && files[viewPath] && !classifyMobileDevice(t)) {
    const view = files[viewPath].replace(/Text\("[^"]+"\)/, `Text(${JSON.stringify(renameTo)})`);
    out.push({ path: viewPath, content: view });
  }

  if (renameTo && !classifyMobileDevice(t)) {
    const safe = renameTo.replace(/</g, '');
    for (const path of Object.keys(files)) {
      if (!/\.html?$/i.test(path)) continue;
      const html = files[path];
      if (!/<h1[\s>]/i.test(html)) continue;
      out.push({
        path,
        content: html.replace(/(<h1[^>]*>)([\s\S]*?)(<\/h1>)/i, `$1${safe}$3`),
      });
    }
  }

  const namedDevice = classifyMobileDevice(t);
  if (namedDevice && files && (iosDir || androidMainActivity(files))) {
    const target = iosDir ? 'ios' : 'android';
    const locked = layoutLockEdits(files, t, target);
    for (const edit of locked) {
      if (!out.some(e => e.path === edit.path)) out.push(edit);
    }
  }

  return out;
}

function hasExistingNative(files?: Record<string, string>) {
  if (!files) return false;
  return Boolean(iosAppDir(files) || androidMainActivity(files));
}

/** If chat asked for a store app but the brain returned a website, use the native template. */
export function finalizeMobileEdits(
  message: string,
  edits: ParsedFileEdit[],
  files?: Record<string, string>,
): ParsedFileEdit[] {
  const target = classifyMobileTarget(message);
  const existing = hasExistingNative(files);
  if (existing && files) {
    if (isLayoutLockAsk(message) || classifyMobileDevice(message)) {
      const lockTarget = target || (iosAppDir(files) ? 'ios' : 'android');
      const locked = layoutLockEdits(files, message, lockTarget);
      const visual = simpleVisualPatchEdits(files, message);
      const merged = [...locked];
      for (const edit of visual) {
        if (!merged.some(e => e.path === edit.path)) merged.push(edit);
      }
      if (merged.length) return merged;
    }
    const visual = simpleVisualPatchEdits(files, message);
    if (visual.length && (!edits.length || isWebOnly(edits))) return visual;
    if (edits.length && hasNative(edits)) return remapNativeEdits(edits, files);
    if (visual.length) return visual;
    return edits;
  }
  return edits;
}

export function preferredMobileFocus(paths: string[]): string | undefined {
  return paths.find(p => p.endsWith('ContentView.swift'))
    || paths.find(p => p.endsWith('MainActivity.kt'))
    || paths.find(p => p.endsWith('.swift') || p.endsWith('.kt'))
    || paths[0];
}
