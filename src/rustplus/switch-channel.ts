import Discord from 'discord.js'
import * as t from 'io-ts'
import _ from 'lodash'
import { DiscordAPI } from '../discord'
import { formatSwitch } from '../discord/formatting'
import log from '../logger'
import { validate } from '../validate'
import { getConfig } from './config'
import {
  deleteEntities,
  Entity,
  EntityType,
  EntityWithError,
  EntityWithInfo,
  getAllEntities,
  getEntities,
  getEntityByDiscordSwitchMessageId,
  getEntityWithWipeAndEntityId,
  updateEntity
} from './entity'
import { getEntityInfo, setEntityValueAsync } from './socket'
import { AppEntityChanged, RustPlusEventEmitter } from './types'

const TOGGLE_SWITCH_EMOJI = '🔀'

const NotFoundError = t.type({ error: t.literal('not_found') })

type DiscordTextChannel =
  | Discord.TextChannel
  | Discord.DMChannel
  | Discord.NewsChannel

let cleanUp: (() => void) | undefined

export async function initSwitchesChannel(
  discord: DiscordAPI,
  events: RustPlusEventEmitter,
  wipeId: number
): Promise<void> {
  if (cleanUp) cleanUp()

  await discord.isReadyP
  const { discordSwitchesChannelId } = await getConfig()
  if (!discordSwitchesChannelId) return
  const channel = await discord.client.channels.fetch(discordSwitchesChannelId)
  if (!channel.isText()) throw new Error('Not a text channel')

  const allSwitchesWithMessage = (await getAllEntities(1)).filter(
    (s) => s.discordSwitchMessageId
  )
  const switches = await getEntities(wipeId, 1)
  // Delete messages in the channel that are from another wipe
  const switchesWithMessageToBeDeleted = _.differenceBy(
    allSwitchesWithMessage,
    switches,
    'discordSwitchMessageId'
  )
  await Promise.all(
    switchesWithMessageToBeDeleted.map(async (s) => {
      await deleteDiscordMessage(
        channel,
        s.discordSwitchMessageId!
      ).catch((err) =>
        log.info(
          err,
          'Failed to delete discord message, probably does not exist'
        )
      )
      await updateEntity({ ...s, discordSwitchMessageId: null })
    })
  )

  const switchesWithEntityInfo = await Promise.all(
    switches.map(async (entity) => ({
      ...entity,
      entityInfo: await getEntityInfo(entity.entityId).catch((err) => {
        log.error(err)
        return validate(NotFoundError, err)
      })
    }))
  )

  const switchesWithEntityInfoOk = switchesWithEntityInfo.filter(
    (entity): entity is EntityWithInfo => !('error' in entity.entityInfo)
  )
  const switchesNotFound = switchesWithEntityInfo.filter(
    (entity): entity is EntityWithError => 'error' in entity.entityInfo
  )

  if (switchesNotFound.length)
    await deleteNotFoundSwitches(wipeId, channel, switchesNotFound)

  await Promise.all(
    switchesWithEntityInfoOk.map((entity) =>
      upsertSwitchMessage(discord, channel, entity)
    )
  )

  const onEntityChanged = async (changedEntity: AppEntityChanged) => {
    try {
      const entity = await getEntityWithWipeAndEntityId(
        wipeId,
        changedEntity.entityId
      )

      if (entity.discordSwitchMessageId) {
        await discord.sendOrEditMessage(
          channel.id,
          formatSwitch(discord.client, entity, changedEntity.payload.value),
          entity.discordSwitchMessageId
        )
      }
    } catch (err) {
      log.error(err)
    }
  }

  const upsertEntity = async (entity: Entity) => {
    try {
      if (entity.entityType === EntityType.Switch)
        await upsertEntityMessage(discord, channel, entity)
    } catch (err) {
      log.error(err)
    }
  }

  const onMessageReactionAdd = async (
    reaction: Discord.MessageReaction,
    user: Discord.User | Discord.PartialUser
  ) => {
    const { discordSwitchesChannelId } = await getConfig()
    if (reaction.message.channel.id !== discordSwitchesChannelId) return
    const messageId = reaction.message.id
    const entity = await getEntityByDiscordSwitchMessageId(messageId)
    if (entity) {
      const entityInfo = await getEntityInfo(entity.entityId)
      const newValue = !entityInfo.payload.value
      log.info(
        { entity, entityInfo, newValue },
        'Got reaction, changing switch state'
      )
      await setEntityValueAsync(entity.entityId, newValue)
      await reaction.users.remove(user.id)
    }
  }

  events.on('entityChanged', onEntityChanged)
  events.on('entityPaired', upsertEntity)
  events.on('entityHandleUpdated', upsertEntity)
  discord.client.on('messageReactionAdd', onMessageReactionAdd)

  cleanUp = () => {
    events.removeListener('entityChanged', onEntityChanged)
    events.removeListener('entityPaired', upsertEntity)
    events.removeListener('entityHandleUpdated', upsertEntity)
    discord.client.removeListener('messageReactionAdd', onMessageReactionAdd)
  }
}

async function upsertEntityMessage(
  discord: DiscordAPI,
  channel: DiscordTextChannel,
  entity: Entity
) {
  await upsertSwitchMessage(discord, channel, {
    ...entity,
    entityInfo: await getEntityInfo(entity.entityId)
  })
}

async function upsertSwitchMessage(
  discord: DiscordAPI,
  channel: DiscordTextChannel,
  entity: EntityWithInfo
): Promise<void> {
  let msg
  try {
    msg = await discord.sendOrEditMessage(
      channel.id,
      formatSwitch(discord.client, entity, entity.entityInfo.payload.value),
      entity.discordSwitchMessageId ?? undefined
    )
  } catch (err) {
    // Unknown Message
    // ---
    // Message id from db does not exist in discord, consider it deleted,
    // update db and try again
    if (err.code === 10008) {
      await updateEntity({ ...entity, discordSwitchMessageId: null })
      await upsertSwitchMessage(discord, channel, {
        ...entity,
        discordSwitchMessageId: null
      })
    } else {
      throw new Error(err)
    }
  }

  if (msg) {
    if (!msg.reactions.cache.get(TOGGLE_SWITCH_EMOJI))
      await msg.react(TOGGLE_SWITCH_EMOJI)
    await updateEntity({ ...entity, discordSwitchMessageId: msg.id })
  }
}

async function deleteNotFoundSwitches(
  wipeId: number,
  channel: DiscordTextChannel,
  switches: EntityWithError[]
): Promise<void> {
  log.info(switches, 'Failed to get entity info for entities, deleting...')
  await Promise.all(
    switches
      .filter((s) => s.discordSwitchMessageId)
      .map((s) => deleteDiscordMessage(channel, s.discordSwitchMessageId!))
  )
  await deleteEntities(
    wipeId,
    switches.map((e) => e.entityId)
  )
}

async function deleteDiscordMessage(
  channel: DiscordTextChannel,
  messageId: string
): Promise<void> {
  await channel.messages.fetch(messageId).then((message) => {
    log.info('Deleting discord message', {
      messageId: message.id
    })

    return message.delete()
  })
}
