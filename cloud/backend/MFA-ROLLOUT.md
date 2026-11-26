# Mandatory TOTP MFA rollout
- Native Supabase TOTP enrollment and challenge; no custom OTP or remembered-device bypass.
- Access requires a signed aal2 JWT with a TOTP AMR timestamp under 120 hours old, a live corresponding auth session, a verified TOTP factor, and active app membership.
- The central enterprise_member gate covers existing app RLS and privileged RPCs. User-facing service-role Edge routes additionally call tp_mfa_status with the caller JWT. Keep the independently authenticated cron dispatch unchanged.
- TEST first. Before enabling PROD, complete real admin enrollment, challenge, failed-code and new-session tests, and confirm a secure lost-authenticator recovery process. The test deployment is not a substitute for practical enrollment.
- Deployment order: publish compatible UI and protect user-facing Edge routes, enable enforcement SQL in a coordinated maintenance window; do not enable production restrictions before the UI is available. Review all new Edge functions for the same check.
- Account activation uses only minimal own membership status before MFA; it does not authorize data access.
- For lost authenticators use authorized, identity-verified administrator recovery in Supabase. Do not bypass 2FA with a password-only reset or public endpoint.
