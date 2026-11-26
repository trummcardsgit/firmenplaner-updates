begin;
-- Five days are measured from the provider-signed TOTP authentication claim,
-- never from token refresh, password login, localStorage or browser time.
create function tp_private.totp_verified_at(p_claims jsonb) returns timestamptz
language sql immutable set search_path='' as $$
 select max(case when a->>'method'='totp' and a->>'timestamp' ~ '^[0-9]{1,10}$'
 then to_timestamp((a->>'timestamp')::double precision) end)
 from jsonb_array_elements(case when jsonb_typeof(p_claims->'amr')='array' then p_claims->'amr' else '[]'::jsonb end) a
$$;
revoke all on function tp_private.totp_verified_at(jsonb) from public,anon,authenticated;
create function tp_private.mfa_fresh() returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(
  (select auth.uid()) is not null
  and (select auth.jwt()->>'aal')='aal2'
  and tp_private.totp_verified_at((select auth.jwt()))>now()-interval '5 days'
  and tp_private.totp_verified_at((select auth.jwt()))<=now()+interval '30 seconds'
  and exists(select 1 from auth.sessions s where s.id::text=(select auth.jwt()->>'session_id') and s.user_id=(select auth.uid()) and s.aal::text='aal2' and (s.not_after is null or s.not_after>now()))
  and exists(select 1 from auth.mfa_factors f where f.user_id=(select auth.uid()) and f.factor_type::text='totp' and f.status::text='verified'), false)
$$;
revoke all on function tp_private.mfa_fresh() from public,anon,authenticated;
-- Central gate used by the existing RLS policies and privileged app RPCs.
create or replace function tp_private.enterprise_member() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.tp_members m where m.user_id=(select auth.uid()) and m.active) and tp_private.mfa_fresh()
$$;
-- Minimal authenticated-only status endpoint, safe at AAL1, for onboarding and MFA.
create function public.tp_mfa_status() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'active', exists(select 1 from public.tp_members m where m.user_id=(select auth.uid()) and m.active),
 'fresh', tp_private.mfa_fresh(),
 'remaining_seconds', case when tp_private.mfa_fresh() then greatest(0,floor(extract(epoch from (tp_private.totp_verified_at((select auth.jwt()))+interval '5 days'-now())))) else 0 end)
$$;
revoke all on function public.tp_mfa_status() from public,anon,authenticated;
grant execute on function public.tp_mfa_status() to authenticated;
commit;