begin;
insert into public.tp_members(user_id,display_name,active) values
 ('00000000-0000-0000-0000-000000000002','CI assignee',true),
 ('00000000-0000-0000-0000-000000000003','CI other',true),
 ('00000000-0000-0000-0000-000000000004','CI inactive',false)
 on conflict(user_id) do update set active=excluded.active;
insert into auth.sessions values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','aal2',null),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','aal2',null),
 ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000003','aal2',null),
 ('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000004','aal2',null);
insert into auth.mfa_factors select id,user_id,'totp','verified' from auth.sessions;
do $$ begin
 if has_function_privilege('anon','public.tp_edit_ticket_description(bigint,text,text)','EXECUTE') or has_table_privilege('authenticated','public.tp_tickets','UPDATE') then raise exception 'Unsafe edit grant';end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','session_id','10000000-0000-0000-0000-000000000001','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
select public.tp_admin_company('Editor CI');
select id as company from public.tp_companies where name='Editor CI' \gset
select public.tp_create_ticket(:'company','Editor test','Original','normal',array['00000000-0000-0000-0000-000000000002']::uuid[]) as ticket \gset
select set_config('editor.ticket',:'ticket',true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','session_id','10000000-0000-0000-0000-000000000002','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
select public.tp_respond_ticket(:ticket,true);
select public.tp_ticket_comment(:ticket,'Helpful note');
select public.tp_close_ticket(:ticket,'Resolved');
do $$ declare a jsonb; b jsonb; begin
 a:=public.tp_sync_battlepass();b:=public.tp_sync_battlepass();
 if a<>b or (a->>'xp')::int<800 or (a->>'xp')::int>=1000 or jsonb_array_length(a->'rewards')<>30 then raise exception 'Wrong first day or duplicate BP XP: %',a;end if;
 if (select count(*) from jsonb_array_elements(a->'challenges') c where c->>'period'='daily' and (c->>'earned')::boolean)<>3 then raise exception 'Daily objectives not credited';end if;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.tp_sync_battlepass()','EXECUTE') or has_table_privilege('authenticated','tp_private.bp_claims','INSERT') or has_table_privilege('authenticated','tp_private.bp_claims','SELECT') then raise exception 'Unsafe BP access';end if;
 if (select count(*) from tp_private.bp_claims where owner_id='00000000-0000-0000-0000-000000000002')<>4 then raise exception 'Duplicate or missing claim ledger';end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','session_id','10000000-0000-0000-0000-000000000003','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
do $$ begin if (public.tp_sync_battlepass()->>'xp')::int<>0 then raise exception 'Foreign BP progress leaked';end if;end $$;
select set_config('request.jwt.claims','{"aal":"aal1"}',true);
do $$ begin
 begin perform public.tp_sync_battlepass();raise exception 'MFA bypass';exception when raise_exception then if sqlerrm<>'Access denied' then raise;end if;end;
end $$;
rollback;
