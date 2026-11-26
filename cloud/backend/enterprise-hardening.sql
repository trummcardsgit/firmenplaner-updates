-- Apply after enterprise-ticket-career.sql; staging only.
begin;
-- Preserve ownership checks; add an independent active-membership requirement.
create policy enterprise_private_storage_gate on storage.objects as restrictive for all to authenticated
 using(bucket_id not in ('tp-private-files','tp-ticket-attachments') or tp_private.enterprise_member())
 with check(bucket_id not in ('tp-private-files','tp-ticket-attachments') or tp_private.enterprise_member());
do $$ declare t text; begin
 foreach t in array array['tp_app_admins','tp_invites','tp_trophy_definitions','tp_attachments'] loop
 if to_regclass('public.'||t) is not null then
 execute format('create policy enterprise_active_gate on public.%I as restrictive for all to authenticated using (tp_private.enterprise_member()) with check (tp_private.enterprise_member())',t);
 end if;
 end loop;
end $$;
-- Legacy privileged RPCs must check membership before running their original code.
do $$ declare f regprocedure; definition text; begin
 foreach f in array array[to_regprocedure('public.tp_game_enter_prestige()'),to_regprocedure('public.tp_sync_trophies()')] loop
 if f is null then continue; end if;
 definition:=pg_get_functiondef(f);
 if position('tp_private.enterprise_member()' in definition)=0 then
  if position(E'\nbegin\n' in definition)=0 then raise exception 'Unexpected RPC body: %',f; end if;
  definition:=replace(definition,E'\nbegin\n',E'\nbegin\n if not tp_private.enterprise_member() then raise exception ''Access denied''; end if;\n');
  execute definition;
 end if;
 end loop;
end $$;
-- Protect the completion RPC and other direct writes of linked tasks via RLS/trigger.
-- Protect historical records while allowing employees to read the names of former members
-- only when an administrator needs to manage their accounts (existing directory policy).
commit;
