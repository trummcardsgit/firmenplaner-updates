-- Staging only; run after enterprise-tickets.sql and enterprise-members.sql.
begin;
create or replace function public.tp_reassign_ticket(p_ticket bigint,p_users uuid[]) returns void language plpgsql security definer set search_path='' as $$
declare t public.tp_tickets%rowtype; u uuid:=auth.uid(); e bigint;
begin
 if not tp_private.enterprise_member() then raise exception 'Access denied'; end if;
 select * into t from public.tp_tickets where id=p_ticket for update;
 if not found or t.status='closed' or not (t.creator_id=u or coalesce(t.assignee_id=u,false) or tp_private.enterprise_admin()) then raise exception 'Not allowed'; end if;
 if p_users is null or cardinality(p_users) not between 1 and 100 or array_position(p_users,null) is not null then raise exception 'Select employees'; end if;
 if (select count(*) from public.tp_members where active and user_id=any(p_users))<>(select count(distinct x) from unnest(p_users) x) then raise exception 'Invalid employees'; end if;
 delete from public.tp_ticket_candidates where ticket_id=p_ticket;
 update public.tp_tickets set status='open',assignee_id=null,updated_at=now(),reminded_at=null where id=p_ticket;
 insert into public.tp_ticket_candidates(ticket_id,user_id) select distinct p_ticket,x from unnest(p_users) x;
 insert into public.tp_ticket_events(ticket_id,actor_id,kind,message) values(p_ticket,u,'reassigned','Ticket erneut zugewiesen') returning id into e;
 insert into public.tp_ticket_notifications(ticket_id,recipient_id,event_id,message) select p_ticket,c.user_id,e,'Ticket #'||p_ticket||' wurde dir zugewiesen.' from public.tp_ticket_candidates c where c.ticket_id=p_ticket;
 if t.creator_id<>all(p_users) then insert into public.tp_ticket_notifications(ticket_id,recipient_id,event_id,message) values(p_ticket,t.creator_id,e,'Ticket #'||p_ticket||' wurde neu zugewiesen.'); end if;
end $$;
-- Reminder is based on most recent assignment, not on original creation.
create or replace function public.tp_ticket_remind() returns integer language plpgsql security invoker set search_path='' as $$
declare t record; e bigint; n integer:=0;
begin
 for t in select * from public.tp_tickets x where x.status='open' and x.reminded_at is null and x.updated_at<=now()-interval '5 days' and not exists(select 1 from public.tp_ticket_candidates c where c.ticket_id=x.id and c.response<>'pending') for update skip locked loop
 update public.tp_tickets set reminded_at=now() where id=t.id;
 insert into public.tp_ticket_events(ticket_id,kind) values(t.id,'five_day_reminder') returning id into e;
 insert into public.tp_ticket_notifications(ticket_id,recipient_id,event_id,message) values(t.id,t.creator_id,e,'Ticket #'||t.id||' wartet seit fünf Tagen auf eine Antwort.');
 n:=n+1;
 end loop;
 return n;
end $$;
create or replace function public.tp_read_ticket_notifications() returns void language sql security definer set search_path='' as $$
 update public.tp_ticket_notifications set read_at=now() where recipient_id=auth.uid() and read_at is null and tp_private.enterprise_member()
$$;
revoke all on function public.tp_reassign_ticket(bigint,uuid[]),public.tp_read_ticket_notifications() from public,anon,authenticated;
grant execute on function public.tp_reassign_ticket(bigint,uuid[]),public.tp_read_ticket_notifications() to authenticated;
-- An attachment is private to the enrolled organization; object keys are server-checked by RLS.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('tp-ticket-attachments','tp-ticket-attachments',false,10485760,array['image/png','image/jpeg','image/webp','application/pdf','text/plain']) on conflict(id) do nothing;
create policy tp_ticket_files_read on storage.objects for select to authenticated using(bucket_id='tp-ticket-attachments' and tp_private.enterprise_member() and exists(select 1 from public.tp_tickets t where t.id::text=(storage.foldername(name))[1]));
create policy tp_ticket_files_insert on storage.objects for insert to authenticated with check(bucket_id='tp-ticket-attachments' and tp_private.enterprise_member() and (storage.foldername(name))[2]=auth.uid()::text and exists(select 1 from public.tp_tickets t where t.id::text=(storage.foldername(name))[1] and t.status in ('open','accepted') and (t.creator_id=auth.uid() or t.assignee_id=auth.uid() or tp_private.enterprise_admin() or exists(select 1 from public.tp_ticket_candidates c where c.ticket_id=t.id and c.user_id=auth.uid() and c.response='pending'))));
create policy tp_ticket_files_delete on storage.objects for delete to authenticated using(bucket_id='tp-ticket-attachments' and tp_private.enterprise_member() and ((storage.foldername(name))[2]=auth.uid()::text or tp_private.enterprise_admin()));
commit;
