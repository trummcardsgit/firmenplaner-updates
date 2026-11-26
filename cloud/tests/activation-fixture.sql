-- Synthetic auth rows ONLY in the ephemeral CI PostgreSQL service.
alter table auth.users add column email_confirmed_at timestamptz, add column encrypted_password text;
create table public.tp_invites(email text primary key,invited_by uuid not null references auth.users(id),status text not null,created_at timestamptz default now(),updated_at timestamptz default now());
