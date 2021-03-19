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

create table map_markers (
  created_at       timestamptz default  now() not null,
  markers          jsonb
);
