const BYPASS_KEY = 'NOVA:bypass-enabled';

/** Read the local development bypass flag without coupling it to React context HMR. */
export function isBypassEnabled(): boolean {
  try {
    return localStorage.getItem(BYPASS_KEY) === '1';
  } catch {
    return false;
  }
}
