-- Apply after enterprise-tickets.sql in staging only.
begin;
create or replace function public.tp_admin_directory() returns table(user_id uuid, email text, display_name text, active boolean, is_admin boolean) language plpgsql security definer set search_path='' as $$
begin
 if not tp_private.enterprise_admin() then raise exception 'Access denied'; end if;
 return query select u.id,u.email::text,coalesce(m.display_name,split_part(u.email,'@',1)),coalesce(m.active,false),exists(select 1 from public.tp_app_admins a where a.user_id=u.id) from auth.users u left join public.tp_members m on m.user_id=u.id where u.email is not null order by u.email;
end $$;
create or replace function public.tp_admin_member(p_user uuid,p_name text,p_active boolean,p_admin boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not tp_private.enterprise_admin() then raise exception 'Access denied'; end if;
 if p_user=auth.uid() then raise exception 'Eigenes Administratorkonto kann hier nicht verändert werden'; end if;
 if p_name is null or length(trim(p_name)) not between 1 and 120 or p_active is null or p_admin is null then raise exception 'Invalid member'; end if;
 if not exists(select 1 from auth.users where id=p_user and email is not null) then raise exception 'Unknown user'; end if;
 perform pg_advisory_xact_lock(782931);
 if not tp_private.enterprise_admin() then raise exception 'Access denied'; end if;
 insert into public.tp_members(user_id,display_name,active) values(p_user,trim(p_name),p_active) on conflict(user_id) do update set display_name=excluded.display_name,active=excluded.active;
 if p_admin and p_active then insert into public.tp_app_admins(user_id) values(p_user) on conflict do nothing;
 else delete from public.tp_app_admins where user_id=p_user; end if;
end $$;
create or replace function public.tp_admin_company(p_name text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not tp_private.enterprise_admin() then raise exception 'Access denied'; end if;
 insert into public.tp_ticket_companies(name) values(trim(p_name)) on conflict(name) do update set active=true;
end $$;
revoke all on function public.tp_admin_directory(),public.tp_admin_member(uuid,text,boolean,boolean),public.tp_admin_company(text) from public,anon,authenticated;
grant execute on function public.tp_admin_directory(),public.tp_admin_member(uuid,text,boolean,boolean),public.tp_admin_company(text) to authenticated;
-- Restrictive membership gate retains all existing ownership policies.
do $$ declare t text; begin
 foreach t in array array['tp_companies','tp_entries','tp_projects','tp_documents','tp_solutions','tp_game_profiles','tp_game_xp_events','tp_user_trophies','tp_push_subscriptions'] loop
 if to_regclass('public.'||t) is not null then
 execute format('create policy enterprise_active_gate on public.%I as restrictive for all to authenticated using (tp_private.enterprise_member()) with check (tp_private.enterprise_member())',t);
 end if;
 end loop;
end $$;
-- Existing solution ownership checks stay in force for writes.
create policy enterprise_shared_solutions on public.tp_solutions for select to authenticated using(tp_private.enterprise_member());
-- Keep author identifiers immutable through ordinary edits.
create or replace function tp_private.solution_owner_immutable() returns trigger language plpgsql set search_path='' as $$
begin if new.owner_id is distinct from old.owner_id then raise exception 'Solution owner is immutable'; end if; return new; end $$;
create trigger tp_solution_owner_immutable before update on public.tp_solutions for each row execute function tp_private.solution_owner_immutable();
create policy enterprise_admin_solution_update on public.tp_solutions for update to authenticated using(tp_private.enterprise_admin()) with check(tp_private.enterprise_admin());
create policy enterprise_admin_solution_delete on public.tp_solutions for delete to authenticated using(tp_private.enterprise_admin());
commit;
