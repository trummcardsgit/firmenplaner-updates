begin;
do $$ declare caller uuid; addr text:='retry-fixture@example.invalid'; begin
 select a.user_id into caller from public.tp_app_admins a join public.tp_members m on m.user_id=a.user_id where m.active limit 1;
 if caller is null then raise exception 'Missing active admin';end if;
 if has_function_privilege('authenticated','public.tp_reserve_employee_invitation(text,uuid)','EXECUTE') or has_function_privilege('anon','public.tp_reserve_employee_invitation(text,uuid)','EXECUTE') then raise exception 'Reservation exposed';end if;
 if not public.tp_reserve_employee_invitation(addr,caller) then raise exception 'First reservation failed';end if;
 if public.tp_reserve_employee_invitation(addr,caller) then raise exception 'Duplicate pending reservation accepted';end if;
 update public.tp_invites set status='failed' where email=addr;
 if not public.tp_reserve_employee_invitation(addr,caller) then raise exception 'Retry failed';end if;
 if public.tp_reserve_employee_invitation(addr,caller) then raise exception 'Parallel retry accepted';end if;
 if not exists(select 1 from public.tp_invites where email=addr and status='pending') then raise exception 'Retry status incorrect';end if;
 if public.tp_reserve_employee_invitation((select lower(email) from auth.users where id=caller),caller) then raise exception 'Existing account reservation accepted';end if;
end $$;
rollback;