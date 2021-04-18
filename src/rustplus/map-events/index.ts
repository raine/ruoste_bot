import * as B from 'baconjs'
import delay from 'delay'
import * as _ from 'lodash'
import { TypedEmitter } from 'tiny-typed-emitter'
import db, { DEFAULT, pgp, skip } from '../../db'
import log from '../../logger'
import { getMapMarkers } from '../socket'
import { getWipeId } from '../server'
import {
  AppMarker,
  CrateEvent,
  DbMapEvent,
  MapEvent,
  RustPlusEvents,
  ServerInfo
} from '../types'
import { cargoShipEntered, cargoShipLeft } from './cargo-ship'
import { ch47 } from './ch47'
import { crate, isOilrigCrateEvent, removeCrateRefreshes } from './crate'
import { bradleyDestroyedOrPatrolHeliDown } from './explosion'

const mapEventsColumnSet = new pgp.helpers.ColumnSet(
  [
    { name: 'created_at', prop: 'createdAt', def: DEFAULT, skip },
    { name: 'wipe_id', prop: 'wipeId', skip },
    { name: 'type', skip },
    { name: 'data', cast: 'json', skip },
    { name: 'discord_message_id', prop: 'discordMessageId', def: null, skip },
    {
      name: 'discord_message_last_updated_at',
      prop: 'discordMessageLastUpdatedAt',
      def: null,
      skip
    }
  ],
  { table: 'map_events' }
)

export async function insertMapEvent(
  event: Omit<DbMapEvent, 'mapEventId'>
): Promise<DbMapEvent> {
  return db.one(pgp.helpers.insert(event, mapEventsColumnSet) + ' returning *')
}

export async function updateMapEvent(
  mapEventId: number,
  newMapEvent: Partial<DbMapEvent>
): Promise<DbMapEvent> {
  return db.one(
    pgp.helpers.update(newMapEvent, mapEventsColumnSet) +
      ' where map_event_id = $[mapEventId] returning *',
    { mapEventId }
  )
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
    ...(await crate(server, currentMarkers, newMarkers, removedMarkers)),
    ...(await ch47(server, newMarkers))
  ]
}

let lastMapMarkers: AppMarker[] | undefined

export async function checkMapEvents(
  serverInfo: ServerInfo,
  mapEventsBus: B.Bus<MapEvent>
) {
  const markers = (await getMapMarkers()).filter(
    (marker) => !['VendingMachine', 'Player'].includes(marker.type)
  )

  if (markers.length) {
    const wipeId = await getWipeId(serverInfo)
    await db.none(
      `insert into map_markers (wipe_id, markers)
       values ($[wipeId], $[markers])`,
      { wipeId, markers: JSON.stringify(markers) }
    )
  }

  if (lastMapMarkers) {
    const newMarkers = getNewMarkers(lastMapMarkers, markers)
    const removedMarkers = getRemovedMarkers(lastMapMarkers, markers)
    newMarkers.forEach((marker) => log.info(marker, 'New map marker'))
    removedMarkers.forEach((marker) => log.info(marker, 'Removed map marker'))
    const mapEvents = await generateMapEventsFromMarkersDiff(
      serverInfo,
      lastMapMarkers,
      markers
    )

    mapEvents.forEach((ev) => mapEventsBus.push(ev))
  }
  lastMapMarkers = markers
}

let timeoutId: NodeJS.Timeout | undefined

export function resetLastMapMarkers() {
  lastMapMarkers = undefined
}

export async function trackMapEvents(
  serverInfo: ServerInfo,
  wipeId: number,
  emitter: TypedEmitter<RustPlusEvents>,
  loopInterval = 5000,
  maxLoopCount?: number,
  oilrigTimeBuffer = 10000
) {
  if (timeoutId) clearInterval(timeoutId)
  lastMapMarkers = undefined
  log.info('Starting to track map events')

  // Small and large oilrig crates respawn every once in a while with new id.
  // It manifests by crate despawning and then appearing again and those two
  // can happen more than 5 secs apart.
  const mapEventsBus = new B.Bus<MapEvent>()
  const otherMapEvents = mapEventsBus.filter((ev) => !isOilrigCrateEvent(ev))
  const oilrigCrateMapEvents = mapEventsBus.filter((ev) =>
    isOilrigCrateEvent(ev)
  )
  const oilrigCrateMapEventsWithoutRefreshes = oilrigCrateMapEvents
    .bufferWithTime(oilrigTimeBuffer)
    //@ts-ignore
    .flatMap((crateEvents: CrateEvent[]) =>
      B.fromArray(removeCrateRefreshes(crateEvents))
    )

  const merged = otherMapEvents
    .merge(oilrigCrateMapEventsWithoutRefreshes)
    .map((event) => ({ ...event, wipeId }))
    .flatMap((dbMapEvent) => B.fromPromise(insertMapEvent(dbMapEvent)))

  merged.onValue((event) => {
    emitter.emit('mapEvent', event)
  })

  return (async function loop(loopCount: number): Promise<void> {
    try {
      await checkMapEvents(serverInfo, mapEventsBus)
    } catch (err) {
      log.error(err, 'Error while checking for map events')
    }
    if (maxLoopCount && loopCount >= maxLoopCount - 1) {
      return new Promise((resolve) => {
        merged.onEnd(resolve)
        mapEventsBus.end()
      })
    } else if (maxLoopCount) {
      await delay(loopInterval)
      return loop(loopCount + 1)
    } else {
      timeoutId = global.setTimeout(() => loop(loopCount + 1), loopInterval)
    }
  })(0)
}
