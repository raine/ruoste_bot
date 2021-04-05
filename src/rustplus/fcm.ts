import * as Sentry from '@sentry/node'
import pushReceiver from 'push-receiver'
import { events, state } from '.'
import db from '../db'
import log from '../logger'
import { validate } from '../validate'
import fakePushReceiver from './fake-push-receiver'
import { FcmNotification } from './types'

let fcmSocket: any

const useFakePushReceiver = process.env.FAKE_FCM === '1'
const fcm = useFakePushReceiver ? fakePushReceiver : pushReceiver

async function onFcmNotification(raw: any) {
  log.info(raw, 'FCM notification received')

  try {
    const data = validate(FcmNotification, raw)
    const currentServerInfo = state.serverInfo
    await addPersistentId(data.persistentId)
    const { ip, port } = data.notification.data.body
    const isNotificationFromCurrentServer =
      ip === currentServerInfo?.host && port === currentServerInfo?.port
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

export async function addPersistentId(id: string): Promise<void> {
  await db.none(
    `insert into fcm_persistent_ids (persistent_id) values ($1)`,
    id
  )
}

export async function getPersistentIds(): Promise<string[]> {
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
