import { ServerInfo } from './types'
import log from '../logger'
import { EntityType, getEntities } from './entity'
import { getEntityInfo } from './rustplus-socket'
import db from '../db'
import * as t from 'io-ts'
import { validateP } from '../validate'

const UPKEEP_UPDATE_INTERVAL = 300 * 1000

const UpkeepDiscordMessage = t.type({
  wipeId: t.number,
  discordMessageId: t.string
})

export type UpkeepDiscordMessage = t.TypeOf<typeof UpkeepDiscordMessage>

export async function trackUpkeep(serverInfo: ServerInfo, wipeId: number) {
  log.info('Starting to track upkeep')
  const storageMonitors = await getEntities(wipeId, EntityType.StorageMonitor)
  if (!storageMonitors.length) return
  const storageMonitorsWithEntityInfo = await Promise.all(
    storageMonitors.map(async (entity) => ({
      ...entity,
      entityInfo: await getEntityInfo(entity.entityId)
    }))
  )

  const upkeepDiscordMessage = await getUpkeepDiscordMessageId(wipeId)
  if (upkeepDiscordMessage) {
    // edit message
  } else {
    // send new message
  }
}

async function getUpkeepDiscordMessageId(
  wipeId: number
): Promise<UpkeepDiscordMessage | null> {
  return validateP(
    t.union([UpkeepDiscordMessage, t.null]),
    db.oneOrNone(
      `select discord_message_id
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
