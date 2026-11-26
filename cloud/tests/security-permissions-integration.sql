-- Isolated synthetic CI only. No production data.
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
-- Only the 14 app-facing RPCs flagged by the production advisor. Trigger
-- functions in the synthetic fixture are not directly callable RPCs.
do $ declare signature text; oid_ oid; f record; begin
 foreach signature in array array[
 'tp_admin_company(text)','tp_admin_directory()','tp_admin_member(uuid,text,boolean,boolean)',
 'tp_close_ticket(bigint,text)','tp_create_ticket(uuid,text,text,text,uuid[])','tp_game_enter_prestige()',
 'tp_import_ticket_task(bigint)','tp_mfa_status()','tp_publish_ticket_solution(bigint)',
 'tp_read_ticket_notifications()','tp_reassign_ticket(bigint,uuid[])','tp_respond_ticket(bigint,boolean)',
 'tp_sync_trophies()','tp_ticket_comment(bigint,text)'] loop
  oid_:=to_regprocedure('public.'||signature);
  if oid_ is null then raise exception 'Missing expected RPC: %',signature;end if;
  select p.prosecdef,p.proconfig into f from pg_proc p where p.oid=oid_;
  if not f.prosecdef or not has_function_privilege('authenticated',oid_,'EXECUTE') or has_function_privilege('anon',oid_,'EXECUTE') or not coalesce('search_path=""'=any(f.proconfig),false) then raise exception 'Unsafe RPC grant or search path: %',signature;end if;
 end loop;
end $;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','session_id','10000000-0000-0000-0000-000000000001','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
select public.tp_admin_company('Security CI company');
select id as company from public.tp_companies where name='Security CI company' \gset
select public.tp_create_ticket(:'company','Security CI ticket','Test','normal',array['00000000-0000-0000-0000-000000000002']::uuid[]) as ticket \gset
select set_config('security.ci.ticket',:'ticket',true);
select set_config('security.ci.company',:'company',true);
insert into storage.objects(bucket_id,name) values('tp-ticket-attachments',:'ticket'||'/00000000-0000-0000-0000-000000000001/test.pdf');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','session_id','10000000-0000-0000-0000-000000000003','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
do $$ declare t bigint:=current_setting('security.ci.ticket')::bigint; q text; begin
 if not exists(select 1 from public.tp_tickets where id=t) or not exists(select 1 from public.tp_ticket_events where ticket_id=t) or not exists(select 1 from storage.objects where name like t::text||'/%') then raise exception 'Intended team read denied';end if;
 foreach q in array array[
 'select public.tp_admin_directory()','select public.tp_admin_company(''forbidden'')','select public.tp_admin_member(''00000000-0000-0000-0000-000000000003'',''forbidden'',true,true)',
 format('select public.tp_respond_ticket(%s,true)',t),format('select public.tp_reassign_ticket(%s,array[''00000000-0000-0000-0000-000000000003'']::uuid[])',t),format('select public.tp_ticket_comment(%s,''forbidden'')',t),format('select public.tp_close_ticket(%s,''forbidden'')',t),format('select public.tp_import_ticket_task(%s)',t),format('select public.tp_publish_ticket_solution(%s)',t)] loop
  begin execute q; raise exception 'Unexpected allowed RPC: %',q; exception when raise_exception then if sqlerrm like 'Unexpected allowed RPC:%' then raise;end if; end;
 end loop;
 begin insert into storage.objects(bucket_id,name) values('tp-ticket-attachments',t::text||'/00000000-0000-0000-0000-000000000003/forbidden.pdf');raise exception 'Unexpected upload';exception when insufficient_privilege then null;end;
 delete from storage.objects where name=t::text||'/00000000-0000-0000-0000-000000000001/test.pdf';if found then raise exception 'Foreign attachment deleted';end if;
end $$;
-- Pending candidate may comment and accept; a non-assignee may not close.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','session_id','10000000-0000-0000-0000-000000000002','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
select public.tp_ticket_comment(:ticket,'CI candidate comment');
select public.tp_respond_ticket(:ticket,true);
select public.tp_import_ticket_task(:ticket);
-- In accepted state the same unrelated user must be denied on ownership,
-- not merely because the ticket was open.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','session_id','10000000-0000-0000-0000-000000000003','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
do $ declare t bigint:=current_setting('security.ci.ticket')::bigint; begin
 begin perform public.tp_close_ticket(t,'unauthorized'); raise exception 'Unexpected close';exception when raise_exception then if sqlerrm<>'Not allowed' then raise;end if;end;
 begin perform public.tp_import_ticket_task(t); raise exception 'Unexpected import';exception when raise_exception then if sqlerrm<>'Not your accepted ticket' then raise;end if;end;
 begin perform public.tp_reassign_ticket(t,array['00000000-0000-0000-0000-000000000003']::uuid[]);raise exception 'Unexpected reassign';exception when raise_exception then if sqlerrm<>'Not allowed' then raise;end if;end;
end $;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','session_id','10000000-0000-0000-0000-000000000002','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
select public.tp_close_ticket(:ticket,'CI resolved');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','session_id','10000000-0000-0000-0000-000000000003','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
do $ begin
 begin perform public.tp_publish_ticket_solution(current_setting('security.ci.ticket')::bigint);raise exception 'Unexpected publish';exception when raise_exception then if sqlerrm<>'Not allowed' then raise;end if;end;
end $;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','session_id','10000000-0000-0000-0000-000000000002','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
select public.tp_publish_ticket_solution(:ticket);
-- Same account with AAL1 must not access tickets or write via privileged RPC.
select set_config('request.jwt.claims','{"aal":"aal1"}',true);
do $$ declare t bigint:=current_setting('security.ci.ticket')::bigint; q text; s jsonb;begin
 s:=public.tp_mfa_status();if not (s->>'active')::boolean or (s->>'fresh')::boolean or exists(select 1 from public.tp_tickets) or exists(select 1 from public.tp_ticket_events) or exists(select 1 from storage.objects where bucket_id='tp-ticket-attachments') then raise exception 'AAL1 access mismatch';end if;
 foreach q in array array[
 'select public.tp_admin_directory()','select public.tp_admin_company(''denied'')','select public.tp_admin_member(''00000000-0000-0000-0000-000000000003'',''denied'',true,true)',
 format('select public.tp_create_ticket(%L::uuid,''denied'',''denied'',''normal'',array[''00000000-0000-0000-0000-000000000002'']::uuid[])',current_setting('security.ci.company')),
 format('select public.tp_respond_ticket(%s,true)',t),format('select public.tp_reassign_ticket(%s,array[''00000000-0000-0000-0000-000000000003'']::uuid[])',t),format('select public.tp_ticket_comment(%s,''denied'')',t),format('select public.tp_close_ticket(%s,''denied'')',t),format('select public.tp_import_ticket_task(%s)',t),format('select public.tp_publish_ticket_solution(%s)',t),'select public.tp_sync_trophies()','select public.tp_game_enter_prestige()'] loop
 if q like '%tp_game_enter_prestige%' and to_regprocedure('public.tp_game_enter_prestige()') is null then continue;end if;
 begin execute q;raise exception 'Unexpected AAL1 RPC: %',q;exception when raise_exception then if sqlerrm<>'Access denied' then raise;end if;end;
 end loop;
 perform public.tp_read_ticket_notifications(); -- gated no-op rather than exception
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','session_id','10000000-0000-0000-0000-000000000004','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
do $$ begin if (public.tp_mfa_status()->>'active')::boolean or exists(select 1 from public.tp_tickets) or exists(select 1 from storage.objects where bucket_id='tp-ticket-attachments') then raise exception 'Inactive account read allowed';end if;end $$;
rollback;
