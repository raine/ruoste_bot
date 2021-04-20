import * as t from 'io-ts'
import { DateTime } from 'luxon'
import { AppEntityInfo, RustPlusEventEmitter, ServerInfo } from '.'
import db from '../db'
import { DiscordAPI } from '../discord'
import { formatEntitiesUpkeep } from '../discord/formatting'
import { logAndCapture } from '../errors'
import log from '../logger'
import { validate, validateP } from '../validate'
import { getConfig } from './config'
import { EntityType, EntityWithInfo, getEntities, updateEntity } from './entity'
import { getEntityInfo } from './socket'
import { pipe } from 'fp-ts/lib/function'
import { filter, map } from 'fp-ts/lib/Array'

const UPKEEP_UPDATE_INTERVAL = 60 * 1000

const UpkeepDiscordMessage = t.type({
  wipeId: t.number,
  discordMessageId: t.string
})

export type UpkeepDiscordMessage = t.TypeOf<typeof UpkeepDiscordMessage>

const NotFoundError = t.type({ error: t.literal('not_found') })

const then = <A>(fn: (x: A) => A) => (p: Promise<A>) => p.then(fn)

export async function trackUpkeep(
  serverInfo: ServerInfo,
  discord: DiscordAPI,
  wipeId: number,
  events: RustPlusEventEmitter
) {
  const storageMonitors = await getEntities(EntityType.StorageMonitor)
  const storageMonitorsWithEntityInfo = await Promise.all(
    storageMonitors.map(async (entity) => ({
      ...entity,
      entityInfo: await getEntityInfo(entity.entityId).catch((err) => {
        log.error(err)
        return validate(NotFoundError, err)
      })
    }))
  )

  const notFound = storageMonitorsWithEntityInfo.filter(
    (entity) => 'error' in entity.entityInfo
  )

  const poweredStorageMonitors = await pipe(
    storageMonitorsWithEntityInfo,
    filter(
      (entity): entity is EntityWithInfo => !('error' in entity.entityInfo)
    ),
    map(async (entity) =>
      !isStorageMonitorUnpowered(entity.entityInfo) &&
      entity.storageMonitorPoweredAt === null
        ? {
            ...(await updateEntity({
              ...entity,
              storageMonitorPoweredAt: DateTime.local().toSQL()
            })),
            entityInfo: entity.entityInfo
          }
        : entity
    ),
    (xs) => Promise.all(xs),
    then((entities) =>
      entities.filter((entity) => entity.storageMonitorPoweredAt)
    )
  )

  if (notFound.length) {
    await Promise.all(
      notFound.map((entity) =>
        updateEntity({ ...entity, notFoundAt: DateTime.local().toSQL() }).then(
          (entity) => {
            log.info(entity, 'Failed to get entity info for storage monitor')
            events.emit('storageMonitorNotFound', entity)
          }
        )
      )
    )
  }

  const { discordUpkeepChannelId } = await getConfig()
  if (!discordUpkeepChannelId || !poweredStorageMonitors.length) return
  const messageId = (await getUpkeepDiscordMessageId(wipeId))?.discordMessageId
  const message = await discord.sendOrEditMessage(
    discordUpkeepChannelId,
    formatEntitiesUpkeep(serverInfo, poweredStorageMonitors),
    messageId
  )

  if (!messageId && message) {
    await createUpkeepDiscordMessageId({
      wipeId,
      discordMessageId: message.id
    })
  }
}

let timeoutId: NodeJS.Timeout | undefined

export function trackUpkeepLoop(
  discord: DiscordAPI,
  serverInfo: ServerInfo,
  wipeId: number,
  events: RustPlusEventEmitter
) {
  log.info('Starting to track upkeep')
  if (timeoutId) clearTimeout(timeoutId)

  return (async function loop(): Promise<void> {
    await trackUpkeep(serverInfo, discord, wipeId, events).catch(logAndCapture)
    timeoutId = global.setTimeout(loop, UPKEEP_UPDATE_INTERVAL)
  })()
}

export async function getUpkeepDiscordMessageId(
  wipeId: number
): Promise<UpkeepDiscordMessage | null> {
  return validateP(
    t.union([UpkeepDiscordMessage, t.null]),
    db.oneOrNone(
      `select wipe_id, discord_message_id
         from upkeep_discord_messages
        where wipe_id = $[wipeId]`,
      { wipeId }
    )
  )
}

async function createUpkeepDiscordMessageId(
  upkeepDiscordMessage: UpkeepDiscordMessage
): Promise<void> {
  await db.none(
    `insert into upkeep_discord_messages
     values ($[wipeId], $[discordMessageId])`,
    upkeepDiscordMessage
  )
}

export const isStorageMonitorUnpowered = (entityInfo: AppEntityInfo) =>
  entityInfo.payload.capacity === 0

export const isStorageMonitorDecaying = (entityInfo: AppEntityInfo) =>
  entityInfo.payload.protectionExpiry === 0
