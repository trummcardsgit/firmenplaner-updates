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
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','session_id','10000000-0000-0000-0000-000000000005','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
do $$ declare a jsonb;begin
 a:=public.tp_bp_inventory();if jsonb_array_length(a)<>6 then raise exception 'Wrong inventory';end if;
 a:=public.tp_bp_equip(1,1,true);if not exists(select 1 from jsonb_array_elements(a) r where (r->>'level')::int=1 and (r->>'equipped')::boolean) then raise exception 'Not equipped';end if;
 a:=public.tp_bp_equip(1,2,true);a:=public.tp_bp_equip(1,5,true);
 if (select count(*) from jsonb_array_elements(a) r where (r->>'equipped')::boolean)<>3 then raise exception 'Wrong equipped count';end if;
 a:=public.tp_bp_equip(1,1,false);if exists(select 1 from jsonb_array_elements(a) r where (r->>'level')::int=1 and (r->>'equipped')::boolean) then raise exception 'Not unequipped';end if;
 begin perform public.tp_bp_equip(1,30,true);raise exception 'Locked equip allowed';exception when raise_exception then if sqlerrm<>'Belohnung noch gesperrt' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','session_id','10000000-0000-0000-0000-000000000006','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
do $$ begin
 if jsonb_array_length(public.tp_bp_inventory())<>0 then raise exception 'Foreign inventory exposed';end if;
 begin perform public.tp_bp_equip(1,1,true);raise exception 'Foreign equip allowed';exception when raise_exception then if sqlerrm<>'Belohnung noch gesperrt' then raise;end if;end;
end $$;
select set_config('request.jwt.claims','{"aal":"aal1"}',true);
do $$ begin
 begin perform public.tp_bp_inventory();raise exception 'MFA bypass';exception when raise_exception then if sqlerrm<>'Access denied' then raise;end if;end;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.tp_bp_inventory()','EXECUTE') or has_function_privilege('anon','public.tp_bp_equip(integer,integer,boolean)','EXECUTE') or has_table_privilege('authenticated','tp_private.bp_equipped','SELECT') or has_table_privilege('authenticated','tp_private.bp_equipped','INSERT') then raise exception 'Unsafe inventory access';end if;
end $$;
rollback;
