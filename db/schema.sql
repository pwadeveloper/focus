-- Writers rooms: scripts shared by a few writers. Each writer signs in with
-- their name and a generated passkey; only a SHA-256 hash of it is stored.
-- Safe to re-run: `npm run db:migrate`.

create table if not exists rooms (
  id uuid primary key,
  name text not null,
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists writers (
  id uuid primary key,
  room_id uuid not null references rooms(id) on delete cascade,
  name text not null,
  passkey_hash text not null unique,
  role text not null default 'writer' check (role in ('owner', 'writer')),
  color text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists writers_room_name_idx on writers (room_id, lower(name));

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
  -- Deleted scenes stay as tombstones so every writer hears about the delete
  deleted boolean not null default false,
  updated_by uuid references writers(id) on delete set null,
  updated_at timestamptz not null default now(),
  version bigint not null default nextval('change_seq'),
  primary key (script_id, id)
);

-- The writer holding a scene is the only one who can change it until the
-- lock expires (it is renewed every few seconds while they are in it)
create table if not exists scene_locks (
  script_id uuid not null references scripts(id) on delete cascade,
  scene_id text not null,
  writer_id uuid not null references writers(id) on delete cascade,
  expires_at timestamptz not null,
  primary key (script_id, scene_id)
);

create index if not exists scene_locks_writer_idx on scene_locks (writer_id);

create table if not exists presence (
  writer_id uuid primary key references writers(id) on delete cascade,
  script_id uuid references scripts(id) on delete cascade,
  scene_id text,
  seen_at timestamptz not null default now()
);
