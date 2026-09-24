/** Designated developer account — UI shows “DEV”; others keep a normal 7-digit NOVA ID. */

export const NOVA_DEV_EMAIL = 'thomaskrishnan0107@gmail.com';

export function isNovaDevEmail(email: string | null | undefined): boolean {
  return String(email || '').trim().toLowerCase() === NOVA_DEV_EMAIL;
}

/** People can type DEV / dev when adding the developer account. */
export function isDevNovaAlias(raw: string): boolean {
  return /^dev$/i.test(String(raw || '').trim());
}
