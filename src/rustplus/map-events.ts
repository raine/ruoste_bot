import { getMapMarkers, getTime } from './rustplus-socket'
import * as _ from 'lodash'
import {
  MapEvent,
  RustPlusEvents,
  AppMarker,
  DbMapEvent,
  ServerConfig,
  CargoShipEnteredMapEvent
} from './types'
import { TypedEmitter } from 'tiny-typed-emitter'
import log from '../logger'
import db, { pgp, DEFAULT } from '../db'

const isMarkerCargoShip = (marker: AppMarker) => marker.type === 'CargoShip'

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

const createDbMapEvent = (
  serverConfig: ServerConfig,
  event: MapEvent
): DbMapEvent => ({ ...event, ...serverConfig })

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

function getPreviousCargoSpawn(server: ServerConfig): Promise<string | null> {
  return db
    .oneOrNone(
      `select created_at
         from map_events
        where server_host = $[serverHost]
          and server_port = $[serverPort]
          and type = 'CARGO_SHIP_ENTERED'
        order by created_at desc
        limit 1`,
      server
    )
    .then((res) => (res ? res.createdAt : null))
}

const createCargoShipEnteredEvent = (
  server: ServerConfig
) => async (): Promise<CargoShipEnteredMapEvent> => ({
  type: 'CARGO_SHIP_ENTERED' as const,
  data: {
    previousSpawn: await getPreviousCargoSpawn(server),
    dayLengthMinutes: (await getTime()).dayLengthMinutes
  }
})

export async function generateMapEventsFromMarkersDiff(
  server: ServerConfig,
  prevMarkers: AppMarker[],
  currentMarkers: AppMarker[]
): Promise<MapEvent[]> {
  const newMarkers = getNewMarkers(prevMarkers, currentMarkers)
  const removedMarkers = getRemovedMarkers(prevMarkers, currentMarkers)

  return [
    ...(await Promise.all(
      newMarkers
        .filter(isMarkerCargoShip)
        .map(createCargoShipEnteredEvent(server))
    )),

    ...removedMarkers.filter(isMarkerCargoShip).map(() => ({
      type: 'CARGO_SHIP_LEFT' as const,
      data: undefined
    }))
  ]
}

let lastMapMarkers: AppMarker[] | undefined

export async function checkMapEvents(
  config: ServerConfig,
  emitter: TypedEmitter<RustPlusEvents>
) {
  const markers = await getMapMarkers()
  if (markers.length)
    await db.none(
      `insert into map_markers (markers) values ($1)`,
      JSON.stringify(markers)
    )
  if (lastMapMarkers) {
    const newMarkers = getNewMarkers(lastMapMarkers, markers)
    newMarkers.forEach((marker) => log.info(marker, 'New map marker'))
    const mapEvents = await generateMapEventsFromMarkersDiff(
      config,
      lastMapMarkers,
      markers
    )
    if (mapEvents.length)
      await insertMapEvents(mapEvents.map((e) => createDbMapEvent(config, e)))
    mapEvents.forEach((ev) => emitter.emit('mapEvent', ev))
  }
  lastMapMarkers = markers
}

let timeoutId: NodeJS.Timeout | undefined

export function resetLastMapMarkers() {
  lastMapMarkers = undefined
}

export function trackMapEvents(
  config: ServerConfig,
  emitter: TypedEmitter<RustPlusEvents>
) {
  if (timeoutId) clearInterval(timeoutId)
  lastMapMarkers = undefined
  log.info('Starting to track map events')
  void (async function loop() {
    try {
      await checkMapEvents(config, emitter)
    } catch (err) {
      log.error(err, 'Error while checking for map events')
    }

    timeoutId = global.setTimeout(loop, 5000)
  })()
}
