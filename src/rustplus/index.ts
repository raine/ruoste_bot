import { TypedEmitter } from 'tiny-typed-emitter'
import db from '../db'
import log from '../logger'
import { configure, getConfig, initEmptyConfig } from './config'
import { createEntityFromPairing } from './entity'
import { fcmListen } from './fcm'
import { saveMapIfNotExist } from './map'
import { trackMapEvents } from './map-events'
import * as socket from './rustplus-socket'
import {
  createWipeIfNotExist,
  getServerId,
  upsertServer,
  getCurrentServer
} from './server'
import {
  isServerPairingNotification,
  RustPlusEvents,
  ServerHostPort
} from './types'

export * from './config'
export * from './rustplus-socket'
export * from './types'

export const events = new TypedEmitter<RustPlusEvents>()

export async function init(): Promise<void> {
  events.on('alarm', (alert) => {
    log.info(alert, 'Got an alert')
  })

  events.on('pairing', async (pairing) => {
    log.info(pairing.body, `Got a request to pair ${pairing.body.type}`)

    if (isServerPairingNotification(pairing)) {
      await upsertServer({
        host: pairing.body.ip,
        port: pairing.body.port,
        playerToken: pairing.body.playerToken,
        playerSteamId: pairing.body.playerId
      })
    } else {
      await createEntityFromPairing(pairing.body)
    }
  })

  events.on('mapEvent', (mapEvent) => {
    log.info(mapEvent, 'Map event')
  })

  events.on('connected', async (serverInfo) => {
    log.info(serverInfo, 'Connected to rust server')
    await createWipeIfNotExist(serverInfo)
    await saveMapIfNotExist(serverInfo)
    void trackMapEvents(serverInfo, events)
  })

  await initEmptyConfig()

  let config
  try {
    config = await getConfig()
  } catch (err) {
    log.warn(err, 'Failed to get rustplus configuration')
    return
  }

  if (config.fcmCredentials) await fcmListen(config.fcmCredentials)

  const currentServer = await getCurrentServer()
  if (currentServer) void socket.listen(currentServer)
}

export async function connectToServer(server: ServerHostPort) {
  return db.tx(async (t) => {
    const id = await getServerId(server, t)
    await configure({ currentServerId: id }, t)
    const currentServer = await getCurrentServer(t)
    if (currentServer) void socket.listen(currentServer)
  })
}
