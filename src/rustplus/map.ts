import { ServerInfo } from './types'
import { getMap } from '.'
import db from '../db'
import log from '../logger'
import { DateTime } from 'luxon'
import _ from 'lodash'

export async function saveMap(serverInfo: ServerInfo): Promise<void> {
  return db.tx(async (t) => {
    const wipeDateTime = DateTime.fromSeconds(serverInfo.wipeTime).toISO()
    const exists = await t.oneOrNone<{ column: 1 }>(
      `select 1
         from maps
        where server_host = $[host]
          and server_port = $[port]
          and wiped_at = $[wipeDateTime]`,
      { ...serverInfo, wipeDateTime }
    )
    if (!exists) {
      const map = await getMap()
      const mapWithoutJpgImage = _.omit(map, 'jpgImage')
      await t.none(
        `insert into maps (server_host, server_port, wiped_at, data)
         values ($[host], $[port], $[wipedAt], $[data])`,
        {
          ...serverInfo,
          wipedAt: wipeDateTime,
          data: JSON.stringify(mapWithoutJpgImage)
        }
      )

      log.info('Server map saved to database')
    }
  })
}
