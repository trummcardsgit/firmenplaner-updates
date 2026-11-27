begin;
insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000000005','bp-assignee@example.invalid'),('00000000-0000-0000-0000-000000000006','bp-other@example.invalid');
insert into public.tp_members(user_id,display_name,active) values
 ('00000000-0000-0000-0000-000000000005','CI assignee',true),
 ('00000000-0000-0000-0000-000000000006','CI other',true),
 ('00000000-0000-0000-0000-000000000004','CI inactive',false)
 on conflict(user_id) do update set active=excluded.active;
insert into auth.sessions values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','aal2',null),
 ('10000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000005','aal2',null),
 ('10000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000006','aal2',null),
 ('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000004','aal2',null);
insert into auth.mfa_factors select id,user_id,'totp','verified' from auth.sessions;
do $$ begin
 if has_function_privilege('anon','public.tp_edit_ticket_description(bigint,text,text)','EXECUTE') or has_table_privilege('authenticated','public.tp_tickets','UPDATE') then raise exception 'Unsafe edit grant';end if;
end $$;
insert into tp_private.bp_claims(season_id,owner_id,period_kind,period_start,code,xp)
select 1,'00000000-0000-0000-0000-000000000005','season',starts,'fixture',6000 from tp_private.bp_seasons where id=1;
insert into tp_private.bp_equipped(owner_id,slot,season_id,level) values
 ('00000000-0000-0000-0000-000000000005','title',1,2),
 ('00000000-0000-0000-0000-000000000005','frame',1,5),
 ('00000000-0000-0000-0000-000000000005','banner',1,3),
 ('00000000-0000-0000-0000-000000000005','master',1,30),
 ('00000000-0000-0000-0000-000000000004','title',1,2);
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','session_id','10000000-0000-0000-0000-000000000006','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
do $$ declare a jsonb; begin
 a:=public.tp_bp_member_cosmetics();
 if (select count(*) from jsonb_array_elements(a) x where x->>'owner_id'='00000000-0000-0000-0000-000000000005')<>3 then raise exception 'Missing equipped cosmetics or locked item exposed';end if;
 if exists(select 1 from jsonb_array_elements(a) x where x->>'owner_id'='00000000-0000-0000-0000-000000000004' or x ? 'xp' or x ? 'email') then raise exception 'Inactive or private data exposed';end if;
 if jsonb_array_length(public.tp_bp_inventory())<>0 then raise exception 'Foreign inventory exposed';end if;
end $$;
select set_config('request.jwt.claims','{"aal":"aal1"}',true);
do $$ begin
 begin perform public.tp_bp_member_cosmetics();raise exception 'MFA bypass';exception when raise_exception then if sqlerrm<>'Access denied' then raise;end if;end;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.tp_bp_member_cosmetics()','EXECUTE') or has_table_privilege('authenticated','tp_private.bp_equipped','SELECT') or has_table_privilege('authenticated','tp_private.bp_claims','SELECT') then raise exception 'Unsafe shared cosmetics grant';end if;
end $$;
rollback;
