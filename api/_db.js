import pg from 'pg'

const { Pool } = pg

let pool
let schemaReady

export function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured')
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  }

  return pool
}

export async function ensureSchema() {
  if (schemaReady) return

  schemaReady = getPool().query(`
    create extension if not exists pgcrypto;

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
      snapshot_data text,
      snapshot_at timestamptz,
      created_at timestamptz not null default now()
    );

    alter table camera_checks
      add column if not exists snapshot_data text;

    alter table camera_checks
      add column if not exists snapshot_at timestamptz;

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
  `)

  await schemaReady
}

export function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}
