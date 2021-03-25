import _ from 'lodash'
import { getMonuments } from '../map'
import {
  AppMarker,
  CrateEvent,
  CrateGoneEvent,
  CrateSpawnedEvent,
  MapEvent,
  Monument,
  MonumentToken,
  ServerInfo
} from '../types'
import { distance } from '../../math'
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

export async function crate(
  server: ServerInfo,
  currentMarkers: AppMarker[],
  newMarkers: AppMarker[],
  removedMarkers: AppMarker[]
): Promise<(CrateSpawnedEvent | CrateGoneEvent)[]> {
  const monuments = await getMonuments(server)
  const newCrates = newMarkers.filter(isMarkerCrate)
  const removedCrates = removedMarkers.filter(isMarkerCrate)

  return [
    ...newCrates.map((crate) =>
      createCrateSpawnedEvent(
        getNearestMonumentToken(monuments),
        isMarkerOnCargoShip(currentMarkers, removedMarkers),
        crate
      )
    ),
    ...removedCrates.map((crate) =>
      createCrateGoneEvent(
        getNearestMonumentToken(monuments),
        isMarkerOnCargoShip(currentMarkers, removedMarkers),
        crate
      )
    )
  ]
}

const isCrateEventAtMonument = (
  eventType: 'CRATE_GONE' | 'CRATE_SPAWNED',
  monument: MonumentToken
) => ({ type, data }: CrateGoneEvent | CrateSpawnedEvent) =>
  type === eventType && data.monument === monument

export const isOilrigCrateEvent = (ev: MapEvent): ev is CrateEvent =>
  (ev.type === 'CRATE_SPAWNED' || ev.type === 'CRATE_GONE') &&
  (ev.data.monument === 'oil_rig_small' || ev.data.monument === 'large_oil_rig')

export function removeCrateRefreshes(events: CrateEvent[]): CrateEvent[] {
  const monuments = _.uniq(events.map(({ data }) => data.monument)).filter(
    (m): m is MonumentToken => m !== null
  )
  const monumentsWithCrateRefreshes = monuments.filter(
    (m) =>
      events.some(isCrateEventAtMonument('CRATE_SPAWNED', m)) &&
      events.some(isCrateEventAtMonument('CRATE_GONE', m))
  )
  return events.filter(
    (e) =>
      e.data.monument !== null &&
      !monumentsWithCrateRefreshes.includes(e.data.monument)
  )
}
