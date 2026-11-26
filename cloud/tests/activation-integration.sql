begin;
insert into auth.users(id,email) values('00000000-0000-0000-0000-000000000005','new@example.invalid');
insert into public.tp_invites(email,invited_by,status) values('new@example.invalid','00000000-0000-0000-0000-000000000001','pending');
insert into public.tp_activation_pending(user_id,email,display_name) values('00000000-0000-0000-0000-000000000005','new@example.invalid','New employee');
do $$ begin
 if has_table_privilege('authenticated','public.tp_activation_pending','SELECT') or has_table_privilege('anon','public.tp_activation_pending','INSERT') then raise exception 'Pending invitations exposed';end if;
end $$;
update auth.users set email_confirmed_at=now() where id='00000000-0000-0000-0000-000000000005';
do $$ begin
 if exists(select 1 from public.tp_members where user_id='00000000-0000-0000-0000-000000000005') then raise exception 'Activated without password';end if;
end $$;
update auth.users set encrypted_password='ci-fixture-hash' where id='00000000-0000-0000-0000-000000000005';
do $$ begin
 if not exists(select 1 from public.tp_members where user_id='00000000-0000-0000-0000-000000000005' and active and display_name='New employee') then raise exception 'Member not activated';end if;
 if exists(select 1 from public.tp_app_admins where user_id='00000000-0000-0000-0000-000000000005') then raise exception 'Unexpected admin role';end if;
 if exists(select 1 from public.tp_activation_pending where email='new@example.invalid') then raise exception 'Pending not consumed';end if;
end $$;
update public.tp_members set active=false where user_id='00000000-0000-0000-0000-000000000005';
update auth.users set encrypted_password='ci-fixture-second-hash' where id='00000000-0000-0000-0000-000000000005';
do $$ begin
 if exists(select 1 from public.tp_members where user_id='00000000-0000-0000-0000-000000000005' and active) then raise exception 'Disabled user reactivated';end if;
end $$;
rollback;