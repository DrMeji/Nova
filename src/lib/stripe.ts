import { desktopRequest } from '@/lib/httpDesktop';

export async function verifyStripeToken(token: string) {
  const res = await desktopRequest('https://api.stripe.com/v1/balance', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Stripe secret key was rejected');
  return { label: 'Stripe' };
}

export async function runStripeLive(token: string, userText: string): Promise<string> {
  await verifyStripeToken(token);
  const res = await desktopRequest('https://api.stripe.com/v1/charges?limit=8', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Stripe charges request failed');
  const data = res.data as { data?: { id?: string; amount?: number; currency?: string; status?: string }[] };
  const rows = (data.data || []).map(c =>
    `- ${c.id} · ${((c.amount || 0) / 100).toFixed(2)} ${String(c.currency || '').toUpperCase()} · ${c.status}`,
  );
  return [
    'Stripe · recent charges',
    '',
    rows.length ? rows.join('\n') : 'No charges returned.',
    userText ? '' : '',
  ].filter(Boolean).join('\n');
}
