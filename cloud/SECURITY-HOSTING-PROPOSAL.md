# Separate hosting proposal (NOT deployed)
GitHub Pages does not offer custom response headers. The existing meta CSP must not contain frame-ancestors. If an alternative static host (e.g. Cloudflare Pages) is approved, add the following to its generated output as _headers:
```
/*
  Content-Security-Policy: frame-ancestors 'none'
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
```
Keep the full existing meta policy or move it into the response CSP as well. Configure separate TEST and production hosts, Supabase redirect allowlists, activation/recovery URLs, push targets and legacy Edge redirect after approval. Old GitHub Pages origin must stop serving the app (redirect-only or disabled); proxy alone does not protect direct access. Verify response headers and cross-origin iframe blocking, login/MFA, recovery, installation and offline cache. No hosting change made.

## Supabase
Free tier excludes leaked-password protection; Pro or higher required. Authentication settings → Password security → Prevent use of leaked passwords. No subscription or password change. Team ticket reads are intentional; permissions and storage policies retained. Tests use only synthetic isolated PostgreSQL data.
