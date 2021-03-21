import { DateTime } from 'luxon'
import db from '../../db'
import {
  AppMarker,
  CargoShipEnteredMapEvent,
  CargoShipLeftMapEvent,
  ServerInfo
} from '../types'

function getPreviousCargoSpawn(server: ServerInfo): Promise<string | null> {
  const wipeDateTime = DateTime.fromSeconds(server.wipeTime).toISO()
  const { host, port } = server

  return db
    .oneOrNone(
      `select created_at
         from map_events
        where server_host = $[host]
          and server_port = $[port]
          and type = 'CARGO_SHIP_ENTERED'
          and created_at > $[wipeDateTime]
        order by created_at desc
        limit 1`,
      { host, port, wipeDateTime }
    )
    .then((res) => (res ? res.createdAt : null))
}

const isMarkerCargoShip = (marker: AppMarker) => marker.type === 'CargoShip'

const createCargoShipEnteredEvent = (
  server: ServerInfo
) => async (): Promise<CargoShipEnteredMapEvent> => ({
  type: 'CARGO_SHIP_ENTERED' as const,
  data: { previousSpawn: await getPreviousCargoSpawn(server) }
})

const createCargoShipLeftEvent = (): CargoShipLeftMapEvent => ({
  type: 'CARGO_SHIP_LEFT' as const,
  data: undefined
})

export function cargoShipEntered(
  server: ServerInfo,
  newMarkers: AppMarker[]
): Promise<CargoShipEnteredMapEvent[]> {
  return Promise.all(
    newMarkers
      .filter(isMarkerCargoShip)
      .map(createCargoShipEnteredEvent(server))
  )
}

export function cargoShipLeft(
  removedMarkers: AppMarker[]
): CargoShipLeftMapEvent[] {
  return removedMarkers.filter(isMarkerCargoShip).map(createCargoShipLeftEvent)
}
