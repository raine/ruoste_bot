import _ from 'lodash'
import { RustPlusConfig } from './types'
import { validateP } from '../validate'
import db, { Db, pgp } from '../db'
import { fcmListen } from './fcm'

export async function initEmptyConfig(): Promise<void> {
  return db.tx(async (t) => {
    const exists = await t.oneOrNone(`select 1 from rustplus_config`)
    if (!exists) await t.none(`insert into rustplus_config default values;`)
  })
}

export async function getConfig(): Promise<RustPlusConfig> {
  return validateP(RustPlusConfig, db.one(`select * from rustplus_config`))
}

export async function configure(
  cfg: Partial<RustPlusConfig>,
  tx: Db = db
): Promise<void> {
  const cfgSnakeCase = _.mapKeys(cfg, (v, k) => _.snakeCase(k))
  const rustplusConfigColumnSet = new pgp.helpers.ColumnSet(
    [
      { name: 'fcm_credentials', cast: 'json' },
      { name: 'current_server_id' },
      { name: 'discord_alerts_channel_id' },
      { name: 'discord_events_channel_id' },
      { name: 'discord_upkeep_channel_id' },
      { name: 'discord_switches_channel_id' }
    ].filter((key) => key.name in cfgSnakeCase),
    { table: 'rustplus_config' }
  )
  await tx.none(pgp.helpers.update([cfgSnakeCase], rustplusConfigColumnSet))

  if (cfg.fcmCredentials) {
    await fcmListen(cfg.fcmCredentials)
  }
}
