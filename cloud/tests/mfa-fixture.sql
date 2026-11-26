-- Only synthetic claims and sessions in the isolated CI database.
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),aal text,not_after timestamptz);
create table auth.mfa_factors(id uuid primary key,user_id uuid references auth.users(id),factor_type text,status text);
