-- Focus accounts and writers rooms. A writer is a person: their name plus a
-- generated passkey signs them in on any device (only a SHA-256 hash of the
-- passkey is stored). Every script lives in a room: each writer's personal
-- room holds their own scripts, and shared rooms hold up to three writers.
-- Safe to re-run: `npm run db:migrate`.

create table if not exists writers (
  id uuid primary key,
  name text not null,
  passkey_hash text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists rooms (
  id uuid primary key,
  name text not null,
  -- A writer's own scripts: one member, no invite code
  personal boolean not null default false,
  invite_code text unique,
  created_at timestamptz not null default now()
);

create table if not exists room_members (
  room_id uuid not null references rooms(id) on delete cascade,
  writer_id uuid not null references writers(id) on delete cascade,
  role text not null check (role in ('owner', 'writer')),
  color text not null,
  joined_at timestamptz not null default now(),
  primary key (room_id, writer_id)
);

create index if not exists room_members_writer_idx on room_members (writer_id);

create table if not exists sessions (
  token_hash text primary key,
  writer_id uuid not null references writers(id) on delete cascade,
  expires_at timestamptz not null
);

create index if not exists sessions_writer_idx on sessions (writer_id);

-- One counter for every change, so clients can tell which rows they have seen
create sequence if not exists change_seq;

create table if not exists scripts (
  id uuid primary key,
  room_id uuid not null references rooms(id) on delete cascade,
  title text not null default '',
  -- Subtitle, word goal, title page, export settings, revision baseline
  meta jsonb not null default '{}',
  version bigint not null default nextval('change_seq'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scripts_room_idx on scripts (room_id);

create table if not exists scenes (
  script_id uuid not null references scripts(id) on delete cascade,
  id text not null,
  position integer not null,
  title text not null default '',
  slugline text,
  synopsis text,
  content_html text not null default '',
  -- Deleted scenes stay as tombstones so every device hears about the delete
  deleted boolean not null default false,
  updated_by uuid references writers(id) on delete set null,
  updated_at timestamptz not null default now(),
  version bigint not null default nextval('change_seq'),
  primary key (script_id, id)
);

-- The tab holding a scene is the only place it can change until the lock
-- expires (renewed every few seconds). Holds are per tab, not per writer,
-- so one writer's laptop and phone can't overwrite each other.
create table if not exists scene_locks (
  script_id uuid not null references scripts(id) on delete cascade,
  scene_id text not null,
  writer_id uuid not null references writers(id) on delete cascade,
  client_id text not null,
  expires_at timestamptz not null,
  primary key (script_id, scene_id)
);

create index if not exists scene_locks_holder_idx on scene_locks (writer_id, client_id);

create table if not exists presence (
  writer_id uuid not null references writers(id) on delete cascade,
  client_id text not null,
  script_id uuid not null references scripts(id) on delete cascade,
  scene_id text,
  seen_at timestamptz not null default now(),
  primary key (writer_id, client_id)
);

-- Recovery: a second, longer code for when the passkey is lost (hash only)
alter table writers add column if not exists recovery_hash text unique;

-- Device passkeys (Face ID, Touch ID, Windows Hello, security keys). Opening a
-- shared room requires confirming with one; the confirmation lasts 30 days
-- for that session (device)
create table if not exists device_passkeys (
  id text primary key,
  writer_id uuid not null references writers(id) on delete cascade,
  public_key text not null,
  counter bigint not null default 0,
  transports text[],
  label text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists device_passkeys_writer_idx on device_passkeys (writer_id);

alter table sessions add column if not exists room_verified_at timestamptz;

-- The pending WebAuthn challenge for a session (one at a time, short-lived)
create table if not exists webauthn_challenges (
  session_hash text primary key references sessions(token_hash) on delete cascade,
  challenge text not null,
  expires_at timestamptz not null
);
