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
select public.tp_edit_ticket_description(:ticket,E'**Fett**\n- [ ] Prüfen','Original');
do $$ declare t bigint:=current_setting('editor.ticket')::bigint;begin
 if (select description from public.tp_tickets where id=t)<>E'**Fett**\n- [ ] Prüfen' then raise exception 'Rich description not stored';end if;
 if not exists(select 1 from public.tp_ticket_events where ticket_id=t and kind='description_edited' and actor_id=auth.uid()) then raise exception 'No edit audit';end if;
 begin perform public.tp_edit_ticket_description(t,'conflict','Original');raise exception 'Stale edit allowed';exception when raise_exception then if sqlerrm not like 'Beschreibung wurde inzwischen geändert%' then raise;end if;end;
 begin perform public.tp_edit_ticket_description(t,'',E'**Fett**\n- [ ] Prüfen');raise exception 'Blank accepted';exception when raise_exception then if sqlerrm<>'Invalid description' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','session_id','10000000-0000-0000-0000-000000000003','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
do $$ begin
 begin perform public.tp_edit_ticket_description(current_setting('editor.ticket')::bigint,'foreign',E'**Fett**\n- [ ] Prüfen');raise exception 'Foreign edit allowed';exception when raise_exception then if sqlerrm<>'Not allowed' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','session_id','10000000-0000-0000-0000-000000000002','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
select public.tp_edit_ticket_description(:ticket,'Candidate edit',E'**Fett**\n- [ ] Prüfen');
select public.tp_respond_ticket(:ticket,true);
select public.tp_edit_ticket_description(:ticket,'Assignee edit','Candidate edit');
select public.tp_ticket_comment(:ticket,E'__Kommentar__\n- [x] Fertig');
do $$ begin if not exists(select 1 from public.tp_ticket_events where ticket_id=current_setting('editor.ticket')::bigint and kind='comment' and message=E'__Kommentar__\n- [x] Fertig') then raise exception 'Rich comment not preserved';end if;end $$;
select set_config('request.jwt.claims','{"aal":"aal1"}',true);
do $$ begin
 begin perform public.tp_edit_ticket_description(current_setting('editor.ticket')::bigint,'MFA bypass','Assignee edit');raise exception 'AAL1 edit allowed';exception when raise_exception then if sqlerrm<>'Access denied' then raise;end if;end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','session_id','10000000-0000-0000-0000-000000000002','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
select public.tp_close_ticket(:ticket,'Done');
do $$ begin
 begin perform public.tp_edit_ticket_description(current_setting('editor.ticket')::bigint,'closed edit','Assignee edit');raise exception 'Closed edit allowed';exception when raise_exception then if sqlerrm<>'Not allowed' then raise;end if;end;
end $$;
rollback;
