create table fcm_persistent_ids (
  persistent_id    text primary key
);

create table servers (
  server_id        serial primary key,
  host             text not null,
  port             integer not null,
  player_token     integer not null,
  player_steam_id  text not null,
  created_at       timestamptz default now(),
  unique (host, port)
);

create table wipes (
  wipe_id       serial primary key,
  wiped_at      timestamptz not null,
  server_id     integer references servers (server_id) on delete cascade,
  map_size      integer not null,
  seed          integer not null,
  created_at    timestamptz default now(),
  base_location jsonb,
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

create table entities (
  wipe_id       integer references wipes (wipe_id) on delete cascade,
  entity_id     integer not null,
  entity_type   integer not null,
  handle        text,
  created_at    timestamptz default now() not null,
  discord_pairing_message_id text,
  unique(wipe_id, entity_type, entity_id),
  unique(wipe_id, entity_type, handle)
);

create table upkeep_discord_messages (
  wipe_id             integer references wipes (wipe_id) on delete cascade not null,
  discord_message_id  text
  -- last_updated_at     timestamptz
);

create table rustplus_config (
  fcm_credentials            json,
  current_server_id          integer references servers (server_id),
  discord_alerts_channel_id  text,
  discord_events_channel_id  text
);
