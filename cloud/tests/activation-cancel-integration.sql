begin;
insert into auth.users(id,email) values('00000000-0000-0000-0000-000000000006','cancel@example.invalid');
insert into public.tp_invites(email,invited_by,status) values('cancel@example.invalid','00000000-0000-0000-0000-000000000001','pending');
insert into public.tp_activation_pending(user_id,email,display_name) values('00000000-0000-0000-0000-000000000006','cancel@example.invalid','Cancelled');
do $$ begin
 if has_function_privilege('authenticated','public.tp_cancel_pending_activation(uuid,uuid,text)','EXECUTE') then raise exception 'Cancellation exposed';end if;
 begin perform public.tp_cancel_pending_activation('00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000002','cancel@example.invalid');raise exception 'Non-admin cancellation accepted';exception when others then if sqlerrm='Non-admin cancellation accepted' then raise;end if;end;
end $$;
select public.tp_cancel_pending_activation('00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000001','cancel@example.invalid');
update auth.users set email_confirmed_at=now(),encrypted_password='ci-only-hash' where id='00000000-0000-0000-0000-000000000006';
do $$ begin
 if exists(select 1 from public.tp_members where user_id='00000000-0000-0000-0000-000000000006') then raise exception 'Cancelled account activated';end if;
 if not exists(select 1 from public.tp_activation_pending where email='cancel@example.invalid' and cancelled_at is not null) then raise exception 'Cancellation not recorded';end if;
end $$;
-- Simulate Auth API deletion only in the disposable CI fixture.
delete from auth.users where id='00000000-0000-0000-0000-000000000006';
delete from public.tp_invites where email='cancel@example.invalid' and status='failed';
do $$ begin if exists(select 1 from public.tp_activation_pending where email='cancel@example.invalid') or exists(select 1 from public.tp_invites where email='cancel@example.invalid') then raise exception 'Cancellation cleanup failed';end if;end $$;
rollback;