/** Designated developer account — UI shows “DEV”; others keep a normal 7-digit NOVA ID. */

export const ARK_DEV_EMAIL = 'thomaskrishnan0107@gmail.com';

export function isArkDevEmail(email: string | null | undefined): boolean {
  return String(email || '').trim().toLowerCase() === ARK_DEV_EMAIL;
}

/** People can type DEV / dev when adding the developer account. */
export function isDevArkAlias(raw: string): boolean {
  return /^dev$/i.test(String(raw || '').trim());
}
