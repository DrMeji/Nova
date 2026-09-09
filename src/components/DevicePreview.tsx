import { familyOfDevice, type PhoneDevice } from '@/lib/mobileDevices';

export function DevicePreview({
  device,
  html,
}: {
  device: PhoneDevice;
  html: string;
}) {
  const kind = familyOfDevice(device);
  const frameW = device.width;
  const frameH = device.height;

  if (!html?.trim()) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center p-8 gap-2 text-center">
        <p className="text-sm text-content-secondary">No preview yet</p>
      </div>
    );
  }

  const shell =
    kind === 'computer'
      ? 'rounded-xl border border-zinc-600 bg-zinc-800 p-2 pb-6 shadow-2xl'
      : kind === 'tablet'
        ? 'rounded-[1.6rem] border-[10px] border-zinc-700 bg-zinc-900 shadow-2xl'
        : 'rounded-[2.2rem] border-[10px] border-zinc-700 bg-zinc-900 shadow-2xl';

  return (
    <div className="h-full w-full overflow-auto flex flex-col items-center justify-center p-6 gap-3">
      <p className="text-[11px] text-content-tertiary">
        {device.label} · {device.width}×{device.height} {device.unit}
      </p>
      <div className={`${shell} relative shrink-0`} style={{ width: frameW, height: frameH }}>
        {kind === 'phone' && (
          <span className="absolute top-1.5 left-1/2 -translate-x-1/2 w-16 h-1.5 rounded-full bg-zinc-600 z-10" />
        )}
        <iframe
          title={`${device.label} preview`}
          srcDoc={html}
          className={`w-full h-full border-0 bg-white ${kind === 'computer' ? 'rounded-md' : 'rounded-[1.4rem]'}`}
          sandbox="allow-scripts"
        />
      </div>
    </div>
  );
}
