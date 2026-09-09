/** Deployed NOVA account website (website/ folder) — used for Supabase email reset redirects. */

export function accountWebsiteOrigin(): string {
  const v = (import.meta as { env?: Record<string, string> }).env?.VITE_ARK_WEBSITE_ORIGIN;
  return typeof v === 'string' ? v.trim().replace(/\/$/, '') : '';
}

/** True when this desktop build can email a real Forgot-password link to the hosted site. */
export function isAccountWebsiteConfigured(): boolean {
  return Boolean(accountWebsiteOrigin());
}

export function accountResetRedirectUrl(): string {
  const origin = accountWebsiteOrigin();
  return origin ? `${origin}/account/reset` : '';
}

export function accountForgotPageUrl(): string {
  const origin = accountWebsiteOrigin();
  return origin ? `${origin}/account/forgot` : '';
}
