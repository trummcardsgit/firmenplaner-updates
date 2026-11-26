begin;
alter table public.tp_activation_pending add column cancelled_at timestamptz;
-- The directory exposes only a yes/no flag; pending invitation data remain service-only.
drop function public.tp_admin_directory();
create function public.tp_admin_directory() returns table(user_id uuid,email text,display_name text,active boolean,is_admin boolean,pending_activation boolean) language plpgsql security definer set search_path='' as $$
begin
 if not tp_private.enterprise_admin() then raise exception 'Access denied';end if;
 return query select u.id,u.email::text,coalesce(m.display_name,p.display_name,split_part(u.email,'@',1)),coalesce(m.active,false),exists(select 1 from public.tp_app_admins a where a.user_id=u.id),p.user_id is not null and m.user_id is null and not exists(select 1 from public.tp_app_admins a where a.user_id=u.id) from auth.users u left join public.tp_members m on m.user_id=u.id left join public.tp_activation_pending p on p.user_id=u.id where u.email is not null order by u.email;
end $$;
revoke all on function public.tp_admin_directory() from public,anon,authenticated;
grant execute on function public.tp_admin_directory() to authenticated;
-- Fail closed if any business data reference the account.
create function tp_private.assert_unused_invitation(p_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare r record; found_ref boolean;
begin
 for r in select c.conrelid::regclass as rel,a.attname as col from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1] where c.contype='f' and c.confrelid='auth.users'::regclass and c.connamespace='public'::regnamespace and c.conrelid<>'public.tp_activation_pending'::regclass and cardinality(c.conkey)=1 loop
  execute format('select exists(select 1 from %s where %I=$1)',r.rel,r.col) into found_ref using p_user;
  if found_ref then raise exception 'Konto wird bereits verwendet';end if;
 end loop;
 if exists(select 1 from public.tp_members where user_id=p_user) or exists(select 1 from public.tp_app_admins where user_id=p_user) then raise exception 'Aktives oder bestehendes Mitarbeiterkonto geschützt';end if;
end $$;
revoke all on function tp_private.assert_unused_invitation(uuid) from public,anon,authenticated;
create function public.tp_cancel_pending_activation(p_user uuid,p_caller uuid,p_email text) returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_user=p_caller or not exists(select 1 from public.tp_members m join public.tp_app_admins a on a.user_id=m.user_id where m.user_id=p_caller and m.active) then raise exception 'Access denied';end if;
 perform 1 from auth.users where id=p_user and lower(email)=lower(p_email) for update;
 if not found then raise exception 'Konto nicht gefunden';end if;
 perform 1 from public.tp_activation_pending where user_id=p_user and email=lower(p_email) for update;
 if not found then raise exception 'Keine ausstehende Aktivierung';end if;
 perform tp_private.assert_unused_invitation(p_user);
 update public.tp_activation_pending set cancelled_at=coalesce(cancelled_at,now()) where user_id=p_user;
 update public.tp_invites set status='failed',updated_at=now() where email=lower(p_email);
end $$;
-- service_role cannot access auth.users directly via PostgREST without a privileged wrapper.
alter function public.tp_cancel_pending_activation(uuid,uuid,text) security definer;
revoke all on function public.tp_cancel_pending_activation(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.tp_cancel_pending_activation(uuid,uuid,text) to service_role;
create function tp_private.protect_cancelled_invitation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.tp_activation_pending where user_id=new.user_id and cancelled_at is not null) then raise exception 'Einladung widerrufen';end if;
 return new;
end $$;
revoke all on function tp_private.protect_cancelled_invitation() from public,anon,authenticated;
create trigger tp_no_cancelled_member before insert or update on public.tp_members for each row execute function tp_private.protect_cancelled_invitation();
create function tp_private.guard_pending_auth_delete() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.tp_activation_pending where user_id=old.id and cancelled_at is not null) then perform tp_private.assert_unused_invitation(old.id);end if;
 return old;
end $$;
revoke all on function tp_private.guard_pending_auth_delete() from public,anon,authenticated;
create trigger tp_guard_pending_auth_delete before delete on auth.users for each row execute function tp_private.guard_pending_auth_delete();
-- A revoked invitation stays pending only for retrying a failed Auth API deletion; never activate it.
create or replace function tp_private.complete_employee_activation() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.tp_activation_pending%rowtype;
begin
 if new.email_confirmed_at is null or coalesce(new.encrypted_password,'')='' or new.encrypted_password is not distinct from old.encrypted_password then return new;end if;
 select * into p from public.tp_activation_pending where user_id=new.id and email=lower(trim(new.email)) for update;
 if not found or p.cancelled_at is not null then return new;end if;
 if not exists(select 1 from public.tp_members where user_id=new.id) and not exists(select 1 from public.tp_app_admins where user_id=new.id) and exists(select 1 from public.tp_invites where email=p.email and status in ('pending','sent')) then
 insert into public.tp_members(user_id,display_name,active) values(new.id,p.display_name,true);
 update public.tp_invites set status='sent',updated_at=now() where email=p.email;
 end if;
 delete from public.tp_activation_pending where user_id=new.id;
 return new;
end $$;
commit;