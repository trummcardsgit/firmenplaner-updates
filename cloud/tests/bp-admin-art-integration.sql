-- Isolated CI database: create minimal TEST-only artwork tables before exercising migration.
create table tp_private.bp_test_art_installers(owner_id uuid primary key references public.tp_members(user_id));
create table tp_private.bp_test_card_art(id integer primary key check(id=1),cards jsonb not null,updated_at timestamptz not null default now());
alter table tp_private.bp_test_card_art enable row level security;
alter table tp_private.bp_test_art_installers enable row level security;
revoke all on tp_private.bp_test_card_art,tp_private.bp_test_art_installers from public,anon,authenticated;
\ir ../backend/enterprise-bp-admin-art.sql
begin;
insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000000005','bp-role-test@example.invalid');
insert into public.tp_members(user_id,display_name,active) values ('00000000-0000-0000-0000-000000000005','CI member',true);
insert into auth.sessions values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','aal2',null),('10000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000005','aal2',null);
insert into auth.mfa_factors select id,user_id,'totp','verified' from auth.sessions;
-- Even an old allowlisted non-admin must not be able to upload.
insert into tp_private.bp_test_art_installers values ('00000000-0000-0000-0000-000000000005');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','session_id','10000000-0000-0000-0000-000000000001','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
do $$ declare a jsonb; sample text:='data:image/webp;base64,UklGRjgAAABXRUJQVlA4ICwAAABwAQCdASoEAAEAAUAmJaACdAGIQAD+8JCi6T9T/Rf/UGf/6gz//UGfp4AAAA==';begin
 if public.tp_test_bp_art_get()->>'can_install'<>'true' then raise exception 'Admin cannot import without legacy allowlist';end if;
 a:=public.tp_test_bp_art_install(jsonb_build_object('0',sample,'3',sample,'11',sample,'21',sample,'30',sample));
 if (select count(*) from jsonb_object_keys(a->'cards'))<>5 then raise exception 'Admin upload failed';end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','session_id','10000000-0000-0000-0000-000000000005','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
do $$ declare a jsonb;begin
 a:=public.tp_test_bp_art_get();if a->>'can_install'<>'false' or (select count(*) from jsonb_object_keys(a->'cards'))<>5 then raise exception 'Member visibility wrong';end if;
 begin perform public.tp_test_bp_art_install(a->'cards');raise exception 'Non-admin upload accepted';exception when raise_exception then if sqlerrm<>'Access denied' then raise;end if;end;
end $$;
select set_config('request.jwt.claims','{"aal":"aal1"}',true);
do $$ begin
 begin perform public.tp_test_bp_art_get();raise exception 'MFA bypass';exception when raise_exception then if sqlerrm<>'Access denied' then raise;end if;end;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.tp_test_bp_art_install(jsonb)','EXECUTE') or has_table_privilege('authenticated','tp_private.bp_test_card_art','INSERT') then raise exception 'Unsafe art grant';end if;
end $$;
rollback;
