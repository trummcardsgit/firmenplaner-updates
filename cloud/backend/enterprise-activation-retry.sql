begin;
create function public.tp_reserve_employee_invitation(p_email text,p_caller uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare reserved text;
begin
 if p_email is null or p_email<>lower(trim(p_email)) or length(p_email)>254 or not exists(select 1 from public.tp_members m join public.tp_app_admins a on a.user_id=m.user_id where m.user_id=p_caller and m.active) then raise exception 'Access denied';end if;
 if exists(select 1 from auth.users where lower(email)=p_email) or exists(select 1 from public.tp_activation_pending where email=p_email) then return false;end if;
 insert into public.tp_invites(email,invited_by,status,created_at,updated_at)
 values(p_email,p_caller,'pending',now(),now())
 on conflict(email) do update set invited_by=excluded.invited_by,status='pending',updated_at=now()
 where tp_invites.status='failed'
 and not exists(select 1 from auth.users where lower(email)=p_email)
 and not exists(select 1 from public.tp_activation_pending where email=p_email)
 returning email into reserved;
 return reserved is not null;
end $$;
revoke all on function public.tp_reserve_employee_invitation(text,uuid) from public,anon,authenticated;
grant execute on function public.tp_reserve_employee_invitation(text,uuid) to service_role;
commit;