\set ON_ERROR_STOP on
begin;
-- The earlier concurrency test left a ticket and its private task; verify preservation.
do $$ begin
 if not exists(select 1 from public.tp_ticket_task_links l join public.tp_entries e on e.id=l.entry_id join public.tp_tickets t on t.id=l.ticket_id where e.company_id=t.company_id) then raise exception 'Migrated linked task missing';end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
insert into public.tp_companies(id,owner_id,name) values('10000000-0000-0000-0000-000000000001',auth.uid(),'Shared CI company');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
do $$ begin
 if not exists(select 1 from public.tp_companies where id='10000000-0000-0000-0000-000000000001') then raise exception 'Shared company invisible';end if;
end $$;
select public.tp_create_ticket('10000000-0000-0000-0000-000000000001','Shared firm ticket','CI','normal',array['00000000-0000-0000-0000-000000000003']::uuid[]) as tid \gset
select public.tp_respond_ticket(:tid,true);
do $$ begin
 if not exists(select 1 from public.tp_entries where company_id='10000000-0000-0000-0000-000000000001' and owner_id=auth.uid()) then raise exception 'Task did not use same firm';end if;
 update public.tp_companies set name='Forbidden' where id='10000000-0000-0000-0000-000000000001';
 if found then raise exception 'Non-owner edited shared firm'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $$ begin
 if exists(select 1 from public.tp_entries where company_id='10000000-0000-0000-0000-000000000001') then raise exception 'Private task leaked';end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $$ begin
 begin delete from public.tp_companies where id='10000000-0000-0000-0000-000000000001';raise exception 'Referenced deletion allowed'; exception when foreign_key_violation then null;end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
do $$ begin
 if exists(select 1 from public.tp_companies) then raise exception 'Inactive company read';end if;
end $$;
reset role;
rollback;
