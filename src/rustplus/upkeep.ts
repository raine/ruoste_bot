import * as t from 'io-ts'
import { AppEntityInfo, ServerInfo } from '.'
import db from '../db'
import { DiscordAPI } from '../discord'
import log from '../logger'
import { validateP } from '../validate'
import { getConfig } from './config'
import { EntityType, getEntities } from './entity'
import { getEntityInfo } from './rustplus-socket'

const UPKEEP_UPDATE_INTERVAL = 300 * 1000

const UpkeepDiscordMessage = t.type({
  wipeId: t.number,
  discordMessageId: t.string
})

export type UpkeepDiscordMessage = t.TypeOf<typeof UpkeepDiscordMessage>

export async function trackUpkeep(
  serverInfo: ServerInfo,
  discord: DiscordAPI,
  wipeId: number
) {
  const storageMonitors = await getEntities(wipeId, EntityType.StorageMonitor)
  if (!storageMonitors.length) return
  const storageMonitorsWithEntityInfo = await Promise.all(
    storageMonitors.map(async (entity) => ({
      ...entity,
      entityInfo: await getEntityInfo(entity.entityId)
    }))
  )

  const { discordGeneralChannelId } = await getConfig()
  if (!discordGeneralChannelId) return
  const messageId = (await getUpkeepDiscordMessageId(wipeId))?.discordMessageId
  const message = await discord.sendOrEditUpkeepMessage(
    serverInfo,
    storageMonitorsWithEntityInfo,
    discordGeneralChannelId,
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
  wipeId: number
) {
  log.info('Starting to track upkeep')
  if (timeoutId) clearTimeout(timeoutId)

  return (async function loop(): Promise<void> {
    await trackUpkeep(serverInfo, discord, wipeId)
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
