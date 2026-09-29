-- Run this once in the Supabase SQL editor (Project → SQL Editor → New query)

-- 1. Profiles (mirrors auth.users, one row per user)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Profiles are readable by any authenticated user"
  on profiles for select
  to authenticated
  using (true);

create policy "Users can update their own profile"
  on profiles for update
  to authenticated
  using (id = auth.uid());

-- Auto-create a profile row when someone signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)));
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Conversations (both 1-to-1 and groups)
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default false,
  name text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

alter table conversations enable row level security;

-- 3. Participants
create table if not exists conversation_participants (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table conversation_participants enable row level security;

create policy "Participants can see their own membership rows"
  on conversation_participants for select
  to authenticated
  using (
    user_id = auth.uid()
    or conversation_id in (
      select conversation_id from conversation_participants where user_id = auth.uid()
    )
  );

create policy "Users can join conversations they are added to"
  on conversation_participants for insert
  to authenticated
  with check (true);

create policy "Members can view their conversations"
  on conversations for select
  to authenticated
  using (
    id in (select conversation_id from conversation_participants where user_id = auth.uid())
  );

create policy "Authenticated users can create conversations"
  on conversations for insert
  to authenticated
  with check (created_by = auth.uid());

-- 4. Messages
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  content text,
  image_url text,
  created_at timestamptz not null default now(),
  constraint content_or_image check (content is not null or image_url is not null)
);

alter table messages enable row level security;

create policy "Members can read messages in their conversations"
  on messages for select
  to authenticated
  using (
    conversation_id in (select conversation_id from conversation_participants where user_id = auth.uid())
  );

create policy "Members can send messages in their conversations"
  on messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and conversation_id in (select conversation_id from conversation_participants where user_id = auth.uid())
  );

-- 5. Realtime: enable replication on messages
alter publication supabase_realtime add table messages;

-- 6. Storage bucket for image sharing (public read, authenticated write)
insert into storage.buckets (id, name, public)
values ('chat-images', 'chat-images', true)
on conflict (id) do nothing;

create policy "Anyone can view chat images"
  on storage.objects for select
  using (bucket_id = 'chat-images');

create policy "Authenticated users can upload chat images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'chat-images');
