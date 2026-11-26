begin;
-- A narrow RPC, not a table UPDATE grant. Lock the ticket before authorization and comparison.
create function public.tp_edit_ticket_description(p_ticket bigint,p_description text,p_expected text) returns void
language plpgsql security definer set search_path='' as $$
declare t public.tp_tickets%rowtype; u uuid:=auth.uid(); body text:=trim(p_description);
begin
 if u is null or not tp_private.enterprise_member() then raise exception 'Access denied';end if;
 select * into t from public.tp_tickets where id=p_ticket for update;
 if not found or t.status='closed' or not (t.creator_id=u or coalesce(t.assignee_id=u,false) or tp_private.enterprise_admin() or (t.status='open' and exists(select 1 from public.tp_ticket_candidates c where c.ticket_id=p_ticket and c.user_id=u and c.response='pending'))) then raise exception 'Not allowed';end if;
 if body is null or length(body) not between 1 and 20000 then raise exception 'Invalid description';end if;
 if t.description is distinct from p_expected then raise exception 'Beschreibung wurde inzwischen geändert. Bitte Dialog schließen, Ticket aktualisieren und erneut bearbeiten.';end if;
 if body=t.description then return;end if;
 update public.tp_tickets set description=body,updated_at=now() where id=p_ticket;
 insert into public.tp_ticket_events(ticket_id,actor_id,kind,message) values(p_ticket,u,'description_edited','Ticketbeschreibung wurde bearbeitet.');
end $$;
revoke all on function public.tp_edit_ticket_description(bigint,text,text) from public,anon,authenticated;
grant execute on function public.tp_edit_ticket_description(bigint,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
