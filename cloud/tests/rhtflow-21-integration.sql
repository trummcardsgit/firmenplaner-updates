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
select public.tp_ticket_timer(:ticket,'start');
select public.tp_ticket_timer(:ticket,'start');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','session_id','10000000-0000-0000-0000-000000000001','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
select public.tp_create_ticket(:'company','Second timer','Test','normal',array['00000000-0000-0000-0000-000000000002']::uuid[]) as second_ticket \gset
select set_config('timer.second',:'second_ticket',true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','session_id','10000000-0000-0000-0000-000000000003','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
do $$ begin
 begin perform public.tp_ticket_timer(current_setting('editor.ticket')::bigint,'start');raise exception 'Foreign accepted timer allowed';exception when raise_exception then if sqlerrm<>'Not allowed' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','session_id','10000000-0000-0000-0000-000000000002','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
select public.tp_respond_ticket(:second_ticket,true);
do $$ begin
 begin perform public.tp_ticket_timer(current_setting('timer.second')::bigint,'start');raise exception 'Parallel timer allowed';exception when raise_exception then if sqlerrm<>'Ein anderes Ticket läuft bereits' then raise;end if;end;
end $$;
do $$ begin if (select count(*) from public.tp_ticket_time_sessions where ended_at is null)<>1 then raise exception 'Duplicate running timer';end if;end $$;
select public.tp_ticket_timer(:ticket,'pause');
do $$ begin if not exists(select 1 from public.tp_ticket_time_sessions where end_reason='pause' and ended_at>=started_at) then raise exception 'Pause not stored';end if;end $$;
select public.tp_ticket_timer(:ticket,'start');
select public.tp_close_ticket(:ticket,'Done');
do $$ begin if exists(select 1 from public.tp_ticket_time_sessions where ended_at is null) or not exists(select 1 from public.tp_ticket_time_sessions where end_reason='automatic') then raise exception 'Close did not stop timer';end if;end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','session_id','10000000-0000-0000-0000-000000000003','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
do $$ begin
 if exists(select 1 from public.tp_ticket_time_sessions) then raise exception 'Foreign time exposed';end if;
 begin perform public.tp_ticket_timer(current_setting('editor.ticket')::bigint,'start');raise exception 'Forbidden timer accepted';exception when raise_exception then if sqlerrm<>'Not allowed' then raise;end if;end;
end $$;
select set_config('request.jwt.claims','{"aal":"aal1"}',true);
do $$ begin if exists(select 1 from public.tp_ticket_time_sessions) then raise exception 'MFA bypass';end if;
 begin perform public.tp_ticket_timer(current_setting('editor.ticket')::bigint,'start');raise exception 'MFA timer allowed';exception when raise_exception then if sqlerrm<>'Access denied' then raise;end if;end;
end $$;
reset role;
do $$ begin if has_table_privilege('authenticated','public.tp_ticket_time_sessions','INSERT') or has_table_privilege('authenticated','public.tp_ticket_time_sessions','UPDATE') or has_table_privilege('anon','public.tp_ticket_time_sessions','SELECT') or has_function_privilege('anon','public.tp_ticket_timer(bigint,text)','EXECUTE') then raise exception 'Unsafe timer grant';end if;end $$;
rollback;
