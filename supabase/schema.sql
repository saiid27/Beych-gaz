-- Run this in the Supabase SQL editor after setting DATABASE_URL in Vercel.
-- This schema uses a simple app-owned auth table, not Supabase Auth.

create extension if not exists pgcrypto;

-- 1. App users: phone + hashed password, used only by the backend API.
create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  phone text unique not null,
  password_salt text not null,
  password_hash text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table app_users
  add column if not exists is_admin boolean not null default false;

-- 2. Public chat profile for each app user.
create table if not exists profiles (
  id uuid primary key,
  username text unique not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table profiles drop constraint if exists profiles_id_fkey;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_app_users_id_fkey'
      and conrelid = 'profiles'::regclass
  ) then
    alter table profiles
      add constraint profiles_app_users_id_fkey
      foreign key (id) references app_users(id) on delete cascade;
  end if;
end;
$$;

-- 3. Conversations, participants, and messages.
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default false,
  name text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists conversation_participants (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  content text,
  image_url text,
  created_at timestamptz not null default now(),
  constraint content_or_image check (content is not null or image_url is not null)
);

create table if not exists camera_checks (
  id uuid primary key default gen_random_uuid(),
  manager_id uuid not null references profiles(id) on delete cascade,
  target_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'requested',
  created_at timestamptz not null default now()
);

-- The frontend no longer uses Supabase Auth, so RLS policies based on auth.uid()
-- would block the simple chat client. Keep app_users private and expose chat tables.
alter table profiles disable row level security;
alter table conversations disable row level security;
alter table conversation_participants disable row level security;
alter table messages disable row level security;
alter table camera_checks disable row level security;

grant usage on schema public to anon, authenticated;
grant select on profiles to anon, authenticated;
grant select, insert on conversations to anon, authenticated;
grant select, insert on conversation_participants to anon, authenticated;
grant select, insert on messages to anon, authenticated;
grant select, insert, update on camera_checks to anon, authenticated;

-- 4. Realtime: enable event-driven updates without polling.
do $$
begin
  alter publication supabase_realtime add table messages;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table conversations;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table conversation_participants;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table camera_checks;
exception
  when duplicate_object then null;
end;
$$;

-- 5. Storage bucket for image sharing.
insert into storage.buckets (id, name, public)
values ('chat-images', 'chat-images', true)
on conflict (id) do nothing;

drop policy if exists "Anyone can view chat images" on storage.objects;
create policy "Anyone can view chat images"
  on storage.objects for select
  using (bucket_id = 'chat-images');

drop policy if exists "Anyone can upload chat images" on storage.objects;
create policy "Anyone can upload chat images"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'chat-images');
