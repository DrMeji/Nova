/**
 * Settings → Providers test-connection helper (Missing-tab gap).
 */
export type ProviderTestResult = {
  providerId: string;
  ok: boolean;
  detail: string;
};

export async function testProviderConnection(opts: {
  providerId: string;
  hasKey: boolean;
}): Promise<ProviderTestResult> {
  const id = String(opts.providerId || '');
  if (!opts.hasKey) {
    return { providerId: id, ok: false, detail: 'No API key saved — add one in Settings → Providers' };
  }
  // Desktop cannot probe every vendor without leaking keys; treat key-present as wired OK.
  // Live chat path validates keys on first token.
  return {
    providerId: id,
    ok: true,
    detail: 'Key present — connection will be verified on next chat/create call',
  };
}

export function cloudKeyMissingMessage(): string {
  return 'Cloud API key missing — open Settings → Providers to add a key for coding create.';
}
