-- Up Migration
alter table entities add column storage_monitor_powered_at timestamptz;
-- Down Migration
