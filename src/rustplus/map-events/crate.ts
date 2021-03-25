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
import { isMarkerCargoShip } from './cargo-ship'

const isMarkerCrate = (marker: AppMarker) => marker.type === 'Crate'

const SUFFICIENTLY_CLOSE = 100

const getNearestMonumentToken = (monuments: Monument[]) => (
  marker: AppMarker
): MonumentToken | null => {
  const nearestMonument = _.minBy(monuments, (m) => distance(m, marker))
  const nearestMonumentDistance = nearestMonument
    ? distance(nearestMonument, marker)
    : undefined
  return nearestMonument && nearestMonumentDistance! < SUFFICIENTLY_CLOSE
    ? nearestMonument.token
    : null
}

// Observing real data showed that crate on cargo ship is max ~50 units away
// from cargo ship
const CRATE_CARGO_MAX_DISTANCE = 100

const isMarkerOnCargoShip = (
  currentMarkers: AppMarker[],
  removedMarkers: AppMarker[]
) => (marker: AppMarker): boolean => {
  // Cargo ship is still on map or was removed in the same "tick"
  const cargoShip = [...currentMarkers, ...removedMarkers].find(
    isMarkerCargoShip
  )
  return !!cargoShip && distance(marker, cargoShip) <= CRATE_CARGO_MAX_DISTANCE
}

const createCrateSpawnedEvent = (
  getMonument: (crate: AppMarker) => MonumentToken | null,
  isMarkerOnCargoShip: (crate: AppMarker) => boolean,
  crate: AppMarker
): CrateSpawnedEvent => ({
  type: 'CRATE_SPAWNED' as const,
  data: {
    monument: getMonument(crate),
    onCargoShip: isMarkerOnCargoShip(crate)
  }
})

const createCrateGoneEvent = (
  getMonument: (crate: AppMarker) => MonumentToken | null,
  isCrateOnCargoShip: (crate: AppMarker) => boolean,
  crate: AppMarker
): CrateGoneEvent => ({
  type: 'CRATE_GONE' as const,
  data: {
    monument: getMonument(crate),
    onCargoShip: isCrateOnCargoShip(crate)
  }
})

function haveAlmostSameCoords(a: XY, b: XY): boolean {
  return distance(a, b) <= 1
}

export async function crate(
  server: ServerInfo,
  currentMarkers: AppMarker[],
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
        haveAlmostSameCoords(newCrate, removedCrate)
      )
  )
  const removedCratesNotInNewCrates = removedCrates.filter(
    (removedCrate) =>
      !newCrates.some((newCrate) =>
        haveAlmostSameCoords(removedCrate, newCrate)
      )
  )

  return [
    ...newCratesNotInRemovedCrates.map((crate) =>
      createCrateSpawnedEvent(
        getNearestMonumentToken(monuments),
        isMarkerOnCargoShip(currentMarkers, removedMarkers),
        crate
      )
    ),
    ...removedCratesNotInNewCrates.map((crate) =>
      createCrateGoneEvent(
        getNearestMonumentToken(monuments),
        isMarkerOnCargoShip(currentMarkers, removedMarkers),
        crate
      )
    )
  ]
}
