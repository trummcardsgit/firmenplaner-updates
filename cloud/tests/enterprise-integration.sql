\set ON_ERROR_STOP on
begin;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select public.tp_admin_member('00000000-0000-0000-0000-000000000002','Mitarbeiter 2',true,false);
select public.tp_admin_member('00000000-0000-0000-0000-000000000003','Mitarbeiter 3',true,false);
select public.tp_admin_company('CI Testfirma');
select public.tp_create_ticket(1,'Drucker','Testproblem','urgent',array['00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003']::uuid[]) as id \gset
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select public.tp_respond_ticket(:id,true);
select public.tp_import_ticket_task(:id);
select public.tp_import_ticket_task(:id);
do $$ begin
 if (select count(*) from public.tp_entries)<>1 then raise exception 'Import is not idempotent';end if;
 if (select count(*) from public.tp_ticket_candidates where response='accepted')<>1 then raise exception 'More than one owner';end if;
 begin
  update public.tp_entries set status='done';
  raise exception 'Premature task completion allowed';
 exception when raise_exception then
  if sqlerrm='Premature task completion allowed' then raise;end if;
 end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
do $$ begin
 if exists(select 1 from public.tp_entries) then raise exception 'Private task leaked'; end if;
 begin
  perform public.tp_respond_ticket(1,true);
  raise exception 'Second acceptance allowed';
 exception when raise_exception then
  if sqlerrm='Second acceptance allowed' then raise;end if;
 end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select public.tp_close_ticket(:id,'Druckertreiber korrigiert');
select public.tp_publish_ticket_solution(:id);
select public.tp_publish_ticket_solution(:id);
do $$ begin
 if (select count(*) from public.tp_game_xp_events)<>1 then raise exception 'XP not exactly once';end if;
 if (select count(*) from public.tp_ticket_awards)<>1 then raise exception 'First ticket trophy missing';end if;
 if (select count(*) from public.tp_entries where status='done')<>1 then raise exception 'Task not synchronized';end if;
 if (select count(*) from public.tp_solutions)<>1 then raise exception 'Duplicate solution';end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
do $$ begin
 if (select count(*) from public.tp_solutions)<>1 then raise exception 'Shared solution missing';end if;
 if exists(select 1 from public.tp_game_xp_events) then raise exception 'Private XP leaked';end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
do $$ begin
 if exists(select 1 from public.tp_tickets) or exists(select 1 from public.tp_solutions) then raise exception 'Inactive user can read';end if;
end $$;
-- Inactive user cannot call privileged legacy RPCs (when present).
do $ begin
 if to_regprocedure('public.tp_game_enter_prestige()') is not null then
  begin perform public.tp_game_enter_prestige(); raise exception 'Disabled member allowed'; exception when raise_exception then if sqlerrm <> 'Access denied' then raise; end if; end;
 end if;
 if to_regprocedure('public.tp_sync_trophies()') is not null then
  begin perform public.tp_sync_trophies(); raise exception 'Disabled member allowed'; exception when raise_exception then if sqlerrm <> 'Access denied' then raise; end if; end;
 end if;
end $;
reset role;
rollback;
