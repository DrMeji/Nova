/**
 * Real device viewports (UIKit points / Android dp) for native layouts.
 */

export type MobilePlatform = 'ios' | 'android' | 'both';

export type PhoneDevice = {
  id: string;
  label: string;
  platform: 'ios' | 'android';
  family: 'iphone' | 'ipad' | 'android-phone' | 'android-tablet';
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
  { id: 'pixel-8', label: 'Pixel 8', platform: 'android', family: 'android-phone', width: 412, height: 915, unit: 'dp' },
  { id: 'galaxy-s24', label: 'Galaxy S24', platform: 'android', family: 'android-phone', width: 360, height: 780, unit: 'dp' },
  { id: 'pixel-tablet', label: 'Pixel Tablet', platform: 'android', family: 'android-tablet', width: 800, height: 1280, unit: 'dp' },
];

export function defaultDeviceForTarget(target: MobilePlatform): PhoneDevice {
  if (target === 'android') return PHONE_DEVICES.find(d => d.id === 'galaxy-s24')!;
  return PHONE_DEVICES.find(d => d.id === 'iphone-16')!;
}

export function companionAndroidDevice(ios: PhoneDevice): PhoneDevice {
  if (ios.family === 'ipad') return PHONE_DEVICES.find(d => d.id === 'pixel-tablet')!;
  return PHONE_DEVICES.find(d => d.id === 'galaxy-s24')!;
}

export function devicesForChips(target: MobilePlatform): PhoneDevice[] {
  if (target === 'ios') {
    return PHONE_DEVICES.filter(d => d.platform === 'ios' && ['iphone-se', 'iphone-16', 'iphone-16-pro-max', 'ipad-pro-11', 'ipad-pro-13'].includes(d.id));
  }
  if (target === 'android') {
    return PHONE_DEVICES.filter(d => d.platform === 'android');
  }
  return PHONE_DEVICES.filter(d =>
    ['iphone-16', 'iphone-16-pro-max', 'ipad-pro-11', 'galaxy-s24', 'pixel-tablet'].includes(d.id),
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
