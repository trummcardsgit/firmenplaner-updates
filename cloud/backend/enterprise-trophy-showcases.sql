begin;
create table public.tp_trophy_showcases(
 owner_id uuid primary key references public.tp_members(user_id) on delete cascade,
 trophy_ids integer[] not null default '{}',
 constraint tp_showcase_max_three check(cardinality(trophy_ids)<=3 and coalesce(array_ndims(trophy_ids),1)=1 and array_position(trophy_ids,null) is null)
);
alter table public.tp_trophy_showcases enable row level security;
revoke all on public.tp_trophy_showcases from public,anon,authenticated;
grant select,insert,update on public.tp_trophy_showcases to authenticated;
grant all on public.tp_trophy_showcases to service_role;
create policy showcase_read on public.tp_trophy_showcases for select to authenticated using(tp_private.enterprise_member() and exists(select 1 from public.tp_members m where m.user_id=owner_id and m.active));
create policy showcase_insert on public.tp_trophy_showcases for insert to authenticated with check(tp_private.enterprise_member() and owner_id=(select auth.uid()));
create policy showcase_update on public.tp_trophy_showcases for update to authenticated using(tp_private.enterprise_member() and owner_id=(select auth.uid())) with check(tp_private.enterprise_member() and owner_id=(select auth.uid()));
create function tp_private.validate_trophy_showcase() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and new.owner_id is distinct from old.owner_id then raise exception 'Vitrine owner immutable';end if;
 if cardinality(new.trophy_ids)>3 or exists(select 1 from unnest(new.trophy_ids) t(id) group by id having count(*)>1) then raise exception 'Maximal drei unterschiedliche Trophäen';end if;
 if exists(select 1 from unnest(new.trophy_ids) t(id) where t.id is null or t.id not between 1 and 50 or not exists(select 1 from public.tp_user_trophies w where w.owner_id=new.owner_id and w.trophy_id=t.id)) then raise exception 'Nur selbst freigeschaltete Trophäen sind erlaubt';end if;
 return new;
end $$;
revoke all on function tp_private.validate_trophy_showcase() from public,anon,authenticated;
create trigger tp_validate_showcase before insert or update on public.tp_trophy_showcases for each row execute function tp_private.validate_trophy_showcase();
commit;