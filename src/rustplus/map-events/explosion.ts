import _ from 'lodash'
import { getMonuments } from '../map'
import {
  AppMarker,
  BradleyApcDestroyedMapEvent,
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

const MAX_LAUNCH_SITE_DISTANCE = 250

export async function bradleyDestroyedOrPatrolHeliDown(
  server: ServerInfo,
  newMarkers: AppMarker[]
): Promise<(BradleyApcDestroyedMapEvent | PatrolHeliDownMapEvent)[]> {
  const monuments = await getMonuments(server)
  const launchSite = monuments.find(
    (monument) => monument.token === 'launchsite'
  )
  if (!launchSite) throw new Error('The map has no launch site')
  const explosions = newMarkers.filter(isMarkerExplosion)
  const [explosionsNearLaunchSite, explosionsSomewhereElse] = _.partition(
    explosions,
    (marker) => distance(marker, launchSite) <= MAX_LAUNCH_SITE_DISTANCE
  )

  return [
    ...explosionsNearLaunchSite.map(createBradleyApcDestroyedEvent),
    ...explosionsSomewhereElse.map(createPatrolHeliDownEvent)
  ]
}
