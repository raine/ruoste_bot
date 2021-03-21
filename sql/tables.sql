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

create table maps (
  created_at    timestamptz default now() not null,
  server_host   text not null,
  server_port   integer not null,
  wiped_at      timestamptz not null,
  data          jsonb,

  primary key (server_host, server_port, wiped_at)
);

create table map_events (
  created_at    timestamptz default now() not null,
  server_host   text not null,
  server_port   integer not null,
  type          text not null,
  data          jsonb
);

create table map_markers (
  created_at    timestamptz default now() not null,
  server_host   text not null,
  server_port   integer not null,
  markers       jsonb
);
