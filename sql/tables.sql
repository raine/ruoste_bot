create table rustplus_config (
  fcm_credentials            json,
  server_host                text,
  server_port                integer,
  player_steam_id            text,
  player_token               integer,
  discord_alerts_channel_id  text,
  discord_events_channel_id  text
);

create table fcm_persistent_ids (
  persistent_id    text primary key
);

create table servers (
  server_id     serial primary key,
  server_host   text not null,
  server_port   integer not null,
  created_at    timestamptz default now(),
  unique (server_host, server_port)
);

create table wipes (
  wipe_id       serial primary key,
  wiped_at      timestamptz not null,
  server_id     integer references servers (server_id) on delete cascade,
  map_size      integer not null,
  seed          integer not null,
  created_at    timestamptz default now(),
  unique (server_id, wiped_at)
);

create table maps (
  created_at    timestamptz default now() not null,
  wipe_id       integer references wipes (wipe_id) on delete cascade,
  data          jsonb
);

create table map_events (
  created_at    timestamptz default now() not null,
  wipe_id       integer references wipes (wipe_id) on delete cascade,
  type          text not null,
  data          jsonb
);

create table map_markers (
  created_at    timestamptz default now() not null,
  wipe_id       integer references wipes (wipe_id) on delete cascade,
  markers       jsonb
);
