import _ from 'lodash'
import { DateTime } from 'luxon'
import db from '../../db'
import { validateP } from '../../validate'
import {
  AppMarker,
  BradleyApcDestroyedMapEvent,
  Monument,
  PatrolHeliDownMapEvent,
  ServerInfo
} from '../types'

const isMarkerExplosion = (marker: AppMarker) => marker.type === 'Explosion'

type XY = { x: number; y: number }

function distance({ x: x1, y: y1 }: XY, { x: x2, y: y2 }: XY) {
  const a = x1 - x2
  const b = y1 - y2
  return Math.sqrt(a * a + b * b)
}

const createBradleyApcDestroyedEvent = (): BradleyApcDestroyedMapEvent => ({
  type: 'BRADLEY_APC_DESTROYED' as const,
  data: undefined
})

const createPatrolHeliDownEvent = (): PatrolHeliDownMapEvent => ({
  type: 'PATROL_HELI_DOWN' as const,
  data: undefined
})

function getLaunchSiteCoords(server: ServerInfo): Promise<Monument> {
  const wipeDateTime = DateTime.fromSeconds(server.wipeTime).toISO()
  return validateP(
    Monument,
    db
      .one(
        `with wipe as (
           select *
             from maps
            where wiped_at = $[wipeDateTime]
         )
         select monument.*
           from wipe,
                jsonb_to_recordset(wipe.data->'monuments') AS monument(token text, x numeric, y numeric)
          where token = 'launchsite'`,
        { wipeDateTime }
      )
      // https://github.com/brianc/node-postgres/issues/811
      // numeric is returned as string
      .then((row) => ({
        ...row,
        x: parseFloat(row.x),
        y: parseFloat(row.y)
      }))
  )
}

const MAX_LAUNCH_SITE_DISTANCE = 250

export async function bradleyDestroyedOrPatrolHeliDown(
  server: ServerInfo,
  newMarkers: AppMarker[]
): Promise<(BradleyApcDestroyedMapEvent | PatrolHeliDownMapEvent)[]> {
  const launchSiteCoords = await getLaunchSiteCoords(server)
  const explosions = newMarkers.filter(isMarkerExplosion)
  const [explosionsNearLaunchSite, explosionsSomewhereElse] = _.partition(
    explosions,
    (marker) => distance(marker, launchSiteCoords) <= MAX_LAUNCH_SITE_DISTANCE
  )

  return [
    ...explosionsNearLaunchSite.map(createBradleyApcDestroyedEvent),
    ...explosionsSomewhereElse.map(createPatrolHeliDownEvent)
  ]
}
