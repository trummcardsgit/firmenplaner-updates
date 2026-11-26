begin;
create table public.tp_activation_pending(
 user_id uuid primary key references auth.users(id) on delete cascade,
 email text not null unique references public.tp_invites(email) on delete cascade,
 display_name text not null check(length(trim(display_name)) between 1 and 120),
 issued_at timestamptz not null default now()
);
alter table public.tp_activation_pending enable row level security;
revoke all on public.tp_activation_pending from public,anon,authenticated;
grant select,insert,update,delete on public.tp_activation_pending to service_role;
create or replace function tp_private.complete_employee_activation() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.tp_activation_pending%rowtype;
begin
 if new.email_confirmed_at is null or coalesce(new.encrypted_password,'')='' or new.encrypted_password is not distinct from old.encrypted_password then return new; end if;
 select * into p from public.tp_activation_pending where user_id=new.id and email=lower(trim(new.email)) for update;
 if not found then return new; end if;
 -- Never reactivate a disabled/existing account or grant administrative rights.
 if not exists(select 1 from public.tp_members where user_id=new.id) and not exists(select 1 from public.tp_app_admins where user_id=new.id)
 and exists(select 1 from public.tp_invites where email=p.email and status in ('pending','sent')) then
 insert into public.tp_members(user_id,display_name,active) values(new.id,p.display_name,true);
 update public.tp_invites set status='sent',updated_at=now() where email=p.email;
 end if;
 delete from public.tp_activation_pending where user_id=new.id;
 return new;
end $$;
revoke all on function tp_private.complete_employee_activation() from public,anon,authenticated;
create trigger tp_complete_employee_activation after update of encrypted_password on auth.users for each row execute function tp_private.complete_employee_activation();
commit;