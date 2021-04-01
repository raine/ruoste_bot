import * as Sentry from '@sentry/node'
import * as _ from 'lodash'
import pushReceiver from 'push-receiver'
import { TypedEmitter } from 'tiny-typed-emitter'
import db, { pgp } from '../db'
import log from '../logger'
import { validate, validateP } from '../validate'
import fakePushReceiver from './fake-push-receiver'
import { saveMapIfNotExist } from './map'
import { trackMapEvents } from './map-events'
import * as socket from './rustplus-socket'
import { createWipeIfNotExist, upsertServer } from './server'
import {
  FcmNotification,
  isServerPairingNotification,
  RustPlusConfig,
  RustPlusEvents
} from './types'
export * from './rustplus-socket'
export * from './types'

const useFakePushReceiver = process.env.FAKE_FCM === '1'
const fcm = useFakePushReceiver ? fakePushReceiver : pushReceiver

export const events = new TypedEmitter<RustPlusEvents>()

export async function initEmptyConfig(): Promise<void> {
  return db.tx(async (t) => {
    const exists = await t.oneOrNone(`select 1 from rustplus_config`)
    if (!exists) await t.none(`insert into rustplus_config default values;`)
  })
}

export async function getConfig(): Promise<RustPlusConfig> {
  return validateP(RustPlusConfig, db.one(`select * from rustplus_config`))
}

export async function configure(cfg: Partial<RustPlusConfig>): Promise<void> {
  const cfgSnakeCase = _.mapKeys(cfg, (v, k) => _.snakeCase(k))
  const rustplusConfigColumnSet = new pgp.helpers.ColumnSet(
    [
      { name: 'fcm_credentials', cast: 'json' },
      { name: 'server_host' },
      { name: 'server_port' },
      { name: 'player_steam_id' },
      { name: 'player_token' },
      { name: 'discord_alerts_channel_id' },
      { name: 'discord_events_channel_id' }
    ].filter((key) => key.name in cfgSnakeCase),
    { table: 'rustplus_config' }
  )
  await db.none(pgp.helpers.update([cfgSnakeCase], rustplusConfigColumnSet))

  if (cfg.fcmCredentials) {
    await fcmListen(cfg.fcmCredentials)
  }

  if (
    cfg.serverHost ||
    cfg.serverPort ||
    cfg.playerToken ||
    cfg.playerSteamId
  ) {
    void socket.listen(await getConfig())
  }
}

async function onFcmNotification(raw: any) {
  log.info(raw, 'FCM notification received')

  try {
    const data = validate(FcmNotification, raw)
    const config = await getConfig()
    await addPersistentId(data.persistentId)
    const { ip, port } = data.notification.data.body
    const isNotificationFromCurrentServer =
      ip === config.serverHost && port === config.serverPort
    const isServerPairingNotification =
      data.notification.data.channelId === 'pairing' &&
      data.notification.data.body.type === 'server'

    // Ignore alarms etc. from FCM notifications that are not from the current server
    // Still need the server pairing notification though
    if (!isNotificationFromCurrentServer && !isServerPairingNotification) return

    //@ts-ignore
    events.emit(data.notification.data.channelId, data.notification.data)
  } catch (err) {
    log.warn(err)
    Sentry.captureException(err)
    return
  }
}

let fcmSocket: any

async function addPersistentId(id: string): Promise<void> {
  await db.none(
    `insert into fcm_persistent_ids (persistent_id) values ($1)`,
    id
  )
}

async function getPersistentIds(): Promise<string[]> {
  return (
    await db.any<{ persistentId: string }>(
      `select persistent_id from fcm_persistent_ids`
    )
  ).map((row) => row.persistentId)
}

export async function fcmListen(fcmCredentials: any): Promise<void> {
  if (fcmSocket) {
    log.info('FCM socket exists, reconnecting...')
    fcmSocket.destroy()
  }

  const persistentIds = await getPersistentIds()

  fcmSocket = await fcm.listen(
    { ...fcmCredentials, persistentIds },
    onFcmNotification
  )

  fcmSocket.once('connect', () => {
    log.info('FCM client connected')
  })
}

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

  void socket.listen(config)
}
