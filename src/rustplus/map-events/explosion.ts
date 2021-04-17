import _ from 'lodash'
import { distance } from '../../math'
import { getMonuments } from '../map'
import {
  AppMarker,
  BradleyApcDestroyedMapEvent,
  PatrolHeliDownMapEvent,
  ServerInfo
} from '../types'

const isMarkerExplosion = (marker: AppMarker) => marker.type === 'Explosion'

const createBradleyApcDestroyedEvent = (): BradleyApcDestroyedMapEvent => ({
  type: 'BRADLEY_APC_DESTROYED' as const,
  data: null
})

const createPatrolHeliDownEvent = (): PatrolHeliDownMapEvent => ({
  type: 'PATROL_HELI_DOWN' as const,
  data: null
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
  if (!launchSite) return []
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
