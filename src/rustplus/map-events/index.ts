import { getMapMarkers } from '../rustplus-socket'
import * as _ from 'lodash'
import {
  MapEvent,
  RustPlusEvents,
  AppMarker,
  DbMapEvent,
  ServerInfo,
  RustPlusConfig
} from '../types'
import { TypedEmitter } from 'tiny-typed-emitter'
import log from '../../logger'
import db, { pgp, DEFAULT } from '../../db'
import { cargoShipLeft, cargoShipEntered } from './cargo-ship'
import { bradleyDestroyedOrPatrolHeliDown } from './explosion'
import { crate } from './crate'

const mapMarkersColumnSet = new pgp.helpers.ColumnSet(
  [
    { name: 'server_host', prop: 'serverHost' },
    { name: 'server_port', prop: 'serverPort' },
    { name: 'markers', cast: 'json' }
  ],
  { table: 'map_markers' }
)

const mapEventsColumnSet = new pgp.helpers.ColumnSet(
  [
    { name: 'created_at', prop: 'createdAt', def: DEFAULT },
    { name: 'server_host', prop: 'serverHost' },
    { name: 'server_port', prop: 'serverPort' },
    { name: 'type' },
    { name: 'data', cast: 'json' }
  ],
  { table: 'map_events' }
)

const serverInfoToConfig = ({
  host,
  port
}: ServerInfo): Pick<RustPlusConfig, 'serverHost' | 'serverPort'> => ({
  serverHost: host,
  serverPort: port
})

const createDbMapEvent = (
  serverInfo: ServerInfo,
  event: MapEvent
): DbMapEvent => ({ ...event, ...serverInfoToConfig(serverInfo) })

export async function insertMapEvents(events: DbMapEvent[]): Promise<void> {
  await db.none(pgp.helpers.insert(events, mapEventsColumnSet))
}

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

export async function generateMapEventsFromMarkersDiff(
  server: ServerInfo,
  prevMarkers: AppMarker[],
  currentMarkers: AppMarker[]
): Promise<MapEvent[]> {
  const newMarkers = getNewMarkers(prevMarkers, currentMarkers)
  const removedMarkers = getRemovedMarkers(prevMarkers, currentMarkers)

  return [
    ...(await cargoShipEntered(server, newMarkers)),
    ...cargoShipLeft(removedMarkers),
    ...(await bradleyDestroyedOrPatrolHeliDown(server, newMarkers)),
    ...(await crate(server, newMarkers, removedMarkers))
  ]
}

let lastMapMarkers: AppMarker[] | undefined

export async function checkMapEvents(
  serverInfo: ServerInfo,
  emitter: TypedEmitter<RustPlusEvents>
) {
  const markers = (await getMapMarkers()).filter(
    (marker) => !['VendingMachine', 'Player'].includes(marker.type)
  )

  if (markers.length)
    await db.none(
      pgp.helpers.insert(
        {
          ...serverInfoToConfig(serverInfo),
          markers: JSON.stringify(markers)
        },
        mapMarkersColumnSet
      )
    )

  if (lastMapMarkers) {
    const newMarkers = getNewMarkers(lastMapMarkers, markers)
    newMarkers.forEach((marker) => log.info(marker, 'New map marker'))
    const mapEvents = await generateMapEventsFromMarkersDiff(
      serverInfo,
      lastMapMarkers,
      markers
    )

    if (mapEvents.length)
      await insertMapEvents(
        mapEvents.map((e) => createDbMapEvent(serverInfo, e))
      )

    mapEvents.forEach((ev) => emitter.emit('mapEvent', ev))
  }
  lastMapMarkers = markers
}

let timeoutId: NodeJS.Timeout | undefined

export function resetLastMapMarkers() {
  lastMapMarkers = undefined
}

export function trackMapEvents(
  serverInfo: ServerInfo,
  emitter: TypedEmitter<RustPlusEvents>
) {
  if (timeoutId) clearInterval(timeoutId)
  lastMapMarkers = undefined
  log.info('Starting to track map events')
  void (async function loop() {
    try {
      await checkMapEvents(serverInfo, emitter)
    } catch (err) {
      log.error(err, 'Error while checking for map events')
    }

    timeoutId = global.setTimeout(loop, 5000)
  })()
}
