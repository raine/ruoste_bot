import _ from 'lodash'
import { getMonuments } from '../map'
import {
  AppMarker,
  CrateGoneEvent,
  CrateSpawnedEvent,
  Monument,
  MonumentToken,
  ServerInfo
} from '../types'
import { distance } from '../../math'

const isMarkerCrate = (marker: AppMarker) => marker.type === 'Crate'

const SUFFICIENTLY_CLOSE = 100

const getNearestMonumentToken = (monuments: Monument[]) => (
  marker: AppMarker
) => {
  const nearestMonument = _.minBy(monuments, (m) => distance(m, marker))
  const nearestMonumentDistance = nearestMonument
    ? distance(nearestMonument, marker)
    : undefined
  return nearestMonument && nearestMonumentDistance! < SUFFICIENTLY_CLOSE
    ? nearestMonument.token
    : null
}

const createCrateSpawnedEvent = (
  getMonument: (crate: AppMarker) => MonumentToken | null,
  crate: AppMarker
): CrateSpawnedEvent => ({
  type: 'CRATE_SPAWNED' as const,
  data: { monument: getMonument(crate) }
})

const createCrateGoneEvent = (
  getMonument: (crate: AppMarker) => MonumentToken | null,
  crate: AppMarker
): CrateGoneEvent => ({
  type: 'CRATE_GONE' as const,
  data: { monument: getMonument(crate) }
})

export async function crate(
  server: ServerInfo,
  newMarkers: AppMarker[],
  removedMarkers: AppMarker[]
): Promise<(CrateSpawnedEvent | CrateGoneEvent)[]> {
  const monuments = await getMonuments(server)
  return [
    ...newMarkers
      .filter(isMarkerCrate)
      .map((crate) =>
        createCrateSpawnedEvent(getNearestMonumentToken(monuments), crate)
      ),

    ...removedMarkers
      .filter(isMarkerCrate)
      .map((crate) =>
        createCrateGoneEvent(getNearestMonumentToken(monuments), crate)
      )
  ]
}
