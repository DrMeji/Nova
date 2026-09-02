/** Deployed ARK account website (website/ folder) — used for Supabase email reset redirects. */

export function accountWebsiteOrigin(): string {
  const v = (import.meta as { env?: Record<string, string> }).env?.VITE_ARK_WEBSITE_ORIGIN;
  return typeof v === 'string' ? v.trim().replace(/\/$/, '') : '';
}

export function accountResetRedirectUrl(): string {
  const origin = accountWebsiteOrigin();
  return origin ? `${origin}/account/reset` : '';
}

export function accountForgotPageUrl(): string {
  const origin = accountWebsiteOrigin();
  return origin ? `${origin}/account/forgot` : '';
}
