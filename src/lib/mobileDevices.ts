/**
 * Real device viewports (UIKit points / Android dp) for native layouts.
 */

export type MobilePlatform = 'ios' | 'android' | 'both';

export type DeviceFamilyKind = 'phone' | 'tablet' | 'computer';

export type PhoneDevice = {
  id: string;
  label: string;
  platform: 'ios' | 'android';
  family: 'iphone' | 'ipad' | 'mac' | 'android-phone' | 'android-tablet' | 'android-laptop';
  width: number;
  height: number;
  unit: 'pt' | 'dp';
  /** Xcode #Preview device name, when known. */
  xcodePreview?: string;
};

export const PHONE_DEVICES: PhoneDevice[] = [
  { id: 'iphone-se', label: 'iPhone SE', platform: 'ios', family: 'iphone', width: 375, height: 667, unit: 'pt', xcodePreview: 'iPhone SE (3rd generation)' },
  { id: 'iphone-16', label: 'iPhone 16', platform: 'ios', family: 'iphone', width: 393, height: 852, unit: 'pt', xcodePreview: 'iPhone 16' },
  { id: 'iphone-16-pro-max', label: 'iPhone 16 Pro Max', platform: 'ios', family: 'iphone', width: 440, height: 956, unit: 'pt', xcodePreview: 'iPhone 16 Pro Max' },
  { id: 'ipad-mini', label: 'iPad mini', platform: 'ios', family: 'ipad', width: 744, height: 1133, unit: 'pt', xcodePreview: 'iPad mini (6th generation)' },
  { id: 'ipad-pro-11', label: 'iPad Pro 11', platform: 'ios', family: 'ipad', width: 834, height: 1194, unit: 'pt', xcodePreview: 'iPad Pro 11-inch (M4)' },
  { id: 'ipad-pro-13', label: 'iPad Pro 13', platform: 'ios', family: 'ipad', width: 1024, height: 1366, unit: 'pt', xcodePreview: 'iPad Pro 13-inch (M4)' },
  { id: 'mac-14', label: 'Mac', platform: 'ios', family: 'mac', width: 1440, height: 900, unit: 'pt', xcodePreview: 'MacBook Pro 14"' },
  { id: 'pixel-8', label: 'Pixel 8', platform: 'android', family: 'android-phone', width: 412, height: 915, unit: 'dp' },
  { id: 'galaxy-s24', label: 'Galaxy S24', platform: 'android', family: 'android-phone', width: 360, height: 780, unit: 'dp' },
  { id: 'pixel-tablet', label: 'Pixel Tablet', platform: 'android', family: 'android-tablet', width: 800, height: 1280, unit: 'dp' },
  { id: 'android-laptop', label: 'Android laptop', platform: 'android', family: 'android-laptop', width: 1366, height: 768, unit: 'dp' },
];

export function defaultDeviceForTarget(target: MobilePlatform): PhoneDevice {
  if (target === 'android') return PHONE_DEVICES.find(d => d.id === 'galaxy-s24')!;
  return PHONE_DEVICES.find(d => d.id === 'iphone-16')!;
}

export function companionAndroidDevice(ios: PhoneDevice): PhoneDevice {
  if (ios.family === 'ipad') return PHONE_DEVICES.find(d => d.id === 'pixel-tablet')!;
  if (ios.family === 'mac') return PHONE_DEVICES.find(d => d.id === 'android-laptop')!;
  return PHONE_DEVICES.find(d => d.id === 'galaxy-s24')!;
}

export function familyOfDevice(device: PhoneDevice): DeviceFamilyKind {
  if (device.family === 'ipad' || device.family === 'android-tablet') return 'tablet';
  if (device.family === 'mac' || device.family === 'android-laptop') return 'computer';
  return 'phone';
}

export function defaultDeviceForFamily(platform: 'ios' | 'android', family: DeviceFamilyKind): PhoneDevice {
  if (platform === 'android') {
    if (family === 'tablet') return PHONE_DEVICES.find(d => d.id === 'pixel-tablet')!;
    if (family === 'computer') return PHONE_DEVICES.find(d => d.id === 'android-laptop')!;
    return PHONE_DEVICES.find(d => d.id === 'galaxy-s24')!;
  }
  if (family === 'tablet') return PHONE_DEVICES.find(d => d.id === 'ipad-pro-11')!;
  if (family === 'computer') return PHONE_DEVICES.find(d => d.id === 'mac-14')!;
  return PHONE_DEVICES.find(d => d.id === 'iphone-16')!;
}

export function detectDeviceFamily(message: string): DeviceFamilyKind | null {
  const t = String(message || '').toLowerCase();
  if (/\b(ipads?|tablet|galaxy\s*tab|pixel\s*tab)\b/.test(t)) return 'tablet';
  if (/\b(macbook|imac|mac\s*mini|mac\s*studio|macos|laptop|chromebook|desktop)\b/.test(t)) return 'computer';
  if (/\bmac\b/.test(t) && !/\bmacaroni\b/.test(t)) return 'computer';
  if (/\b(iphones?|android phones?|galaxy s|pixel\s*\d)\b/.test(t)) return 'phone';
  if (/\bphones?\b/.test(t) && !/\b(headphones?|microphone)\b/.test(t)) return 'phone';
  return null;
}

export function needsDeviceFamilyChoice(message: string, target: MobilePlatform | null): boolean {
  if (!target) return false;
  if (isLayoutLockAsk(message)) return false;
  return detectDeviceFamily(message) == null;
}

export function familyBuildPrompt(platform: MobilePlatform, family: DeviceFamilyKind): string {
  const iosDev = defaultDeviceForFamily('ios', family);
  const andDev = defaultDeviceForFamily('android', family);
  if (platform === 'ios') {
    if (family === 'phone') return `Build this as a native iPhone app for ${deviceLine(iosDev)} for the Apple App Store (SwiftUI + Xcode).`;
    if (family === 'tablet') return `Build this as a native iPad app for ${deviceLine(iosDev)} for the Apple App Store (SwiftUI + Xcode).`;
    return `Build this as a native Mac app for ${deviceLine(iosDev)} using SwiftUI. Layout for a laptop window, not a phone.`;
  }
  if (platform === 'android') {
    if (family === 'phone') return `Build this as a native Android phone app for ${deviceLine(andDev)} for Google Play (Kotlin + Android Studio).`;
    if (family === 'tablet') return `Build this as a native Android tablet app for ${deviceLine(andDev)} for Google Play (Kotlin + Android Studio).`;
    return `Build this as a native Android laptop app for ${deviceLine(andDev)} (large window layout, Kotlin + Android Studio).`;
  }
  return `Build this for both Apple (${deviceLine(iosDev)}) and Android (${deviceLine(andDev)}) as native projects.`;
}

export function devicesForChips(target: MobilePlatform): PhoneDevice[] {
  if (target === 'ios') {
    return PHONE_DEVICES.filter(d => d.platform === 'ios' && ['iphone-16', 'ipad-pro-11', 'mac-14'].includes(d.id));
  }
  if (target === 'android') {
    return PHONE_DEVICES.filter(d => ['galaxy-s24', 'pixel-tablet', 'android-laptop'].includes(d.id));
  }
  return PHONE_DEVICES.filter(d =>
    ['iphone-16', 'ipad-pro-11', 'mac-14', 'galaxy-s24', 'pixel-tablet'].includes(d.id),
  );
}

export function resolveDevices(target: MobilePlatform, message: string): { ios?: PhoneDevice; android?: PhoneDevice } {
  const named = classifyMobileDevice(message, target);
  if (target === 'ios') {
    return { ios: named?.platform === 'ios' ? named : defaultDeviceForTarget('ios') };
  }
  if (target === 'android') {
    return { android: named?.platform === 'android' ? named : defaultDeviceForTarget('android') };
  }
  const ios = named?.platform === 'ios' ? named : defaultDeviceForTarget('ios');
  const android = named?.platform === 'android' ? named : companionAndroidDevice(ios);
  return { ios, android };
}

export function classifyMobileDevice(message: string, target?: MobilePlatform | null): PhoneDevice | null {
  const t = String(message || '').toLowerCase();
  if (/iphone\s*16\s*pro\s*max|iphone\s*16\s*plus/.test(t)) {
    return PHONE_DEVICES.find(d => d.id === 'iphone-16-pro-max')!;
  }
  if (/iphone\s*se\b/.test(t)) return PHONE_DEVICES.find(d => d.id === 'iphone-se')!;
  if (/iphone\s*16\b|iphone\s*15\b/.test(t)) return PHONE_DEVICES.find(d => d.id === 'iphone-16')!;
  if (/ipad\s*pro\s*13|ipad\s*pro\s*12/.test(t)) return PHONE_DEVICES.find(d => d.id === 'ipad-pro-13')!;
  if (/ipad\s*mini/.test(t)) return PHONE_DEVICES.find(d => d.id === 'ipad-mini')!;
  if (/ipad/.test(t)) return PHONE_DEVICES.find(d => d.id === 'ipad-pro-11')!;
  if (/pixel\s*tab|android\s*tablet/.test(t)) return PHONE_DEVICES.find(d => d.id === 'pixel-tablet')!;
  if (/galaxy\s*s24|samsung/.test(t) || (/\bgalaxy\b/.test(t) && !/ipad/.test(t))) {
    return PHONE_DEVICES.find(d => d.id === 'galaxy-s24')!;
  }
  if (/\bpixel\b/.test(t)) return PHONE_DEVICES.find(d => d.id === 'pixel-8')!;
  if (/\biphone\b/.test(t)) return PHONE_DEVICES.find(d => d.id === 'iphone-16')!;
  if (/\b(macbook|imac|\bmac\b|macos|laptop)\b/.test(t) && (target === 'ios' || !target)) {
    return PHONE_DEVICES.find(d => d.id === 'mac-14')!;
  }
  if (/\b(chromebook|android laptop)\b/.test(t) || (target === 'android' && /\blaptop\b/.test(t))) {
    return PHONE_DEVICES.find(d => d.id === 'android-laptop')!;
  }
  if (target === 'android') return defaultDeviceForTarget('android');
  if (target === 'ios') return defaultDeviceForTarget('ios');
  return null;
}

export function isLayoutLockAsk(message: string) {
  return /\block (the )?layout\b/i.test(message) || /\btarget layout\b/i.test(message);
}

export function deviceLine(device: PhoneDevice) {
  return `${device.label} · ${device.width}×${device.height} ${device.unit}`;
}

export function layoutLockPrompt(device: PhoneDevice) {
  return `Lock the layout to ${device.label} (${device.width}×${device.height} ${device.unit}). Keep the same native project.`;
}
