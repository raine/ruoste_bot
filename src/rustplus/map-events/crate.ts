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
import { distance, XY } from '../../math'

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

function haveSameCoords({ x: x1, y: y1 }: XY, { x: x2, y: y2 }: XY): boolean {
  return x1 == x2 && y1 === y2
}

export async function crate(
  server: ServerInfo,
  newMarkers: AppMarker[],
  removedMarkers: AppMarker[]
): Promise<(CrateSpawnedEvent | CrateGoneEvent)[]> {
  const monuments = await getMonuments(server)
  const newCrates = newMarkers.filter(isMarkerCrate)
  const removedCrates = removedMarkers.filter(isMarkerCrate)

  // Small and large oilrig crates respawn every once in a while with new id.
  // Take this into account by not considering crate as spawned if it was removed in the
  // same location in same tick. Same for the opposite.
  const newCratesNotInRemovedCrates = newCrates.filter(
    (newCrate) =>
      !removedCrates.some((removedCrate) =>
        haveSameCoords(newCrate, removedCrate)
      )
  )
  const removedCratesNotInNewCrates = removedCrates.filter(
    (removedCrate) =>
      !newCrates.some((newCrate) => haveSameCoords(removedCrate, newCrate))
  )

  return [
    ...newCratesNotInRemovedCrates.map((crate) =>
      createCrateSpawnedEvent(getNearestMonumentToken(monuments), crate)
    ),
    ...removedCratesNotInNewCrates.map((crate) =>
      createCrateGoneEvent(getNearestMonumentToken(monuments), crate)
    )
  ]
}
