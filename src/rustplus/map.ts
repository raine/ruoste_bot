import { Monument, MonumentToken, ServerInfo } from './types'
import { getMap } from '.'
import db from '../db'
import log from '../logger'
import _ from 'lodash'
import { validateP } from '../validate'
import { getWipeId } from './server'
import * as t from 'io-ts'

export async function saveMapIfNotExist(serverInfo: ServerInfo): Promise<void> {
  return db.tx(async (t) => {
    const wipeId = await getWipeId(serverInfo, t)
    const existing = await t.oneOrNone<{ column: 1 }>(
      `select 1 from maps where wipe_id = $[wipeId]`,
      { wipeId }
    )
    if (!existing) {
      const map = await getMap()
      const mapWithoutJpgImage = _.omit(map, 'jpgImage')
      await t.none(
        `insert into maps (wipe_id, data)
         values ($[wipeId], $[data])`,
        { wipeId, data: JSON.stringify(mapWithoutJpgImage) }
      )

      log.info('Server map saved to database')
    }
  })
}

export function getMonuments(
  serverInfo: Pick<ServerInfo, 'host' | 'port' | 'wipeTime'>
): Promise<Monument[]> {
  // TODO: This should fail if there is no map
  return validateP(
    t.array(Monument),
    db
      .many(
        `with wipe as (
           select data
             from servers
             join wipes using (server_id)
             join maps using (wipe_id)
            where host = $[host]
              and port = $[port]
              and wiped_at = $[wipeTime]
         )
         select monument.*
           from wipe,
                jsonb_to_recordset(wipe.data->'monuments') AS monument(token text, x numeric, y numeric)`,
        serverInfo
      )
      // https://github.com/brianc/node-postgres/issues/811
      // numeric is returned as string
      .then((rows: any) =>
        rows.map((row: any) => ({
          ...row,
          x: parseFloat(row.x),
          y: parseFloat(row.y)
        }))
      )
  )
}

const MONUMENT_NAMES: { [k: string]: string | undefined } = {
  military_tunnels_display_name: 'Military Tunnel',
  power_plant_display_name: 'Power Plant',
  oil_rig_small: 'Small Oil Rig',
  sewer_display_name: 'Sewer Branch',
  satellite_dish_display_name: 'Satellite Dish Array',
  airfield_display_name: 'Airfield',
  dome_monument_name: 'Dome',
  junkyard_display_name: 'Junkyard',
  train_yard_display_name: 'Trainyard',
  large_oil_rig: 'Large Oil Rig',
  launchsite: 'Launch Site',
  water_treatment_plant_display_name: 'Water Treatment Plant'
}

export function monumentNameFromToken(
  token: MonumentToken
): string | undefined {
  return MONUMENT_NAMES[token]
}
