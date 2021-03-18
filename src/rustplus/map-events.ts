import { AppMarker, getMapMarkers } from './rustplus-socket'
import * as _ from 'lodash'
import { MapEvent, RustPlusEvents } from './types'
import { TypedEmitter } from 'tiny-typed-emitter'
import log from '../logger'

const isMarkerCargoShip = (marker: AppMarker) => marker.type === 'CargoShip'

export function getNewMarkers(
  prevMarkers: AppMarker[],
  currentMarkers: AppMarker[]
): AppMarker[] {
  return _.differenceBy(currentMarkers, prevMarkers, (marker) => marker.id)
}

export function getRemovedMarkers(
  prevMarkers: AppMarker[],
  currentMarkers: AppMarker[]
): AppMarker[] {
  return _.differenceBy(prevMarkers, currentMarkers, (marker) => marker.id)
}

export function getMapEvents(
  prevMarkers: AppMarker[],
  currentMarkers: AppMarker[]
): MapEvent[] {
  const newMarkers = getNewMarkers(prevMarkers, currentMarkers)
  const removedMarkers = getRemovedMarkers(prevMarkers, currentMarkers)

  return [
    ...newMarkers
      .filter(isMarkerCargoShip)
      .map(() => ({ type: 'CARGO_SHIP_ENTERED' as const })),

    ...removedMarkers
      .filter(isMarkerCargoShip)
      .map(() => ({ type: 'CARGO_SHIP_LEFT' as const }))
  ]
}

let lastMapMarkers: AppMarker[]
let timeoutId: NodeJS.Timeout

export function trackMapEvents(emitter: TypedEmitter<RustPlusEvents>) {
  clearInterval(timeoutId)
  log.info('Starting to track map events')
  ;(async function loop() {
    try {
      const markers = await getMapMarkers()
      if (lastMapMarkers) {
        const newMarkers = getNewMarkers(lastMapMarkers, markers)
        newMarkers.forEach((marker) => {
          log.info(marker, 'New map marker')
        })
        const mapEvents = getMapEvents(lastMapMarkers, markers)
        mapEvents.forEach((ev) => emitter.emit('mapEvent', ev))
      }
      lastMapMarkers = markers
    } catch (err) {
      log.error(err, 'Error while checking for map events')
    }

    timeoutId = setTimeout(loop, 5000)
  })()
}
