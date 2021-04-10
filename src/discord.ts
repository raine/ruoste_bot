const Sentry = require('@sentry/node')

import * as Discord from 'discord.js'
import { DateTime, Interval } from 'luxon'
import {
  formatBotActivityText,
  formatEntitiesUpkeep,
  formatEntityPairing,
  formatMapEvent,
  formatServerEmbed,
  formatServerListReply,
  formatServerListReplyWithUpdatedAt,
  formatServerPairing,
  formatSmartAlarmAlert,
  formatUpcomingWipeList
} from './formatting/discord'
import { getNextWipes } from './get-next-wipes'
import { parseMaxGroupOption } from './input'
import {
  formatSearchParams,
  formatServerListUrl,
  getIdFromServerLink,
  getServerAddressCached1h,
  getServerCached1m,
  getWipedServersCached1m,
  ListServer,
  SERVER_SEARCH_PARAMS
} from './just-wiped'
import log from './logger'
import { XY } from './math'
import * as rustplus from './rustplus'
import {
  AppTeamInfo,
  EntityPairingNotificationData,
  ServerInfo,
  ServerPairingNotificationData
} from './rustplus'
import { EntityWithInfo } from './rustplus/entity'
import { initUpdateLoop, ServerListReply } from './update-loop'

type DiscordServerListReply = ServerListReply<Discord.Message>
let updatedServerListReplies: DiscordServerListReply[] = []

type CommandHandler = (
  text: string | undefined,
  msg: Discord.Message,
  updateRepliesList: (
    servers: ListServer[],
    sentMessage: Discord.Message,
    userMessage: Discord.Message
  ) => void
) => Promise<void>

type Commands = Record<string, CommandHandler>

const commands: (client: Discord.Client) => Commands = () => ({
  '/wipes': async (text, msg, updateRepliesList) => {
    const searchParams = formatSearchParams({
      maxGroup: parseMaxGroupOption(text ?? '')
    })
    getWipedServersCached1m(searchParams)
      .then((servers) =>
        msg.channel
          .send({
            embed: formatServerListReply(
              servers,
              formatServerListUrl(searchParams)
            )
          })
          .then((sent) => {
            updateRepliesList(servers, sent, msg)
          })
      )
      .catch((err) => {
        Sentry.captureException(err)
        log.error(err, 'failed to reply with servers')
        return msg.reply('something went wrong 😳')
      })
  },
  '/nextwipes': async (text, msg) => {
    const sent = await msg.channel.send({
      embed: { description: 'Loading...' }
    })

    const today = text?.includes('today')
    getNextWipes()
      .skip(1)
      .throttle(1000)
      .onValue(({ serverCount, fetchedCount, servers }) => {
        return sent.edit({
          embed: formatUpcomingWipeList(
            serverCount,
            fetchedCount,
            servers,
            today
              ? Interval.fromDateTimes(
                  DateTime.local(),
                  DateTime.local().endOf('day')
                )
              : undefined
          )
        })
      })
  },
  '/rustplus': async (text, msg) => {
    if (process.env.DISCORD_OWNER_USER_ID !== msg.author.id) return
    if (!text) return
    const [subcommand, field, ...rest] = text.split(' ')
    const value = rest.join(' ')
    switch (subcommand) {
      case 'configure': {
        switch (field) {
          case 'fcm': {
            const credentials = JSON.parse(value)
            await rustplus.configure({ fcmCredentials: credentials })
            await msg.reply('Credentials updated!')
            return
          }
          case 'alerts_channel': {
            await rustplus.configure({ discordAlertsChannelId: value })
            await msg.reply('Alerts channel updated!')
            return
          }
          case 'events_channel': {
            await rustplus.configure({ discordEventsChannelId: value })
            await msg.reply('Events channel updated!')
            return
          }
          case 'upkeep_channel': {
            await rustplus.configure({ discordUpkeepChannelId: value })
            await msg.reply('Upkeep channel updated!')
            return
          }
          case 'switches_channel': {
            await rustplus.configure({ discordSwitchesChannelId: value })
            await msg.reply('Switches channel updated!')
            return
          }
          default: {
            await msg.reply(`I don't know how to configure that`)
          }
        }
        break
      }
      case 'setbase': {
        await rustplus.setBaseLocation(msg.reply.bind(msg))
        break
      }
    }
  }
})

const updateServerListMessage = async (
  botMsg: Discord.Message,
  userMessage: Discord.Message
): Promise<ListServer[]> => {
  const searchParams = formatSearchParams({
    maxGroup: parseMaxGroupOption(userMessage.content)
  })
  const servers = await getWipedServersCached1m(searchParams)
  await botMsg.edit({
    embed: formatServerListReplyWithUpdatedAt(
      servers,
      formatServerListUrl(SERVER_SEARCH_PARAMS)
    )
  })
  return servers
}

const handleServerEmbedReply = async (msg: Discord.Message): Promise<void> => {
  const id = getIdFromServerLink(msg.content)
  if (!id) return
  const [server, address] = await Promise.all([
    getServerCached1m(id),
    getServerAddressCached1h(id)
  ])
  await msg.suppressEmbeds(true)
  await msg.channel.send({
    embed: formatServerEmbed(server, address)
  })
}

const BOT_STATUS_UPDATE_INTERVAL = 60000

async function updateBotActivity(client: Discord.Client): Promise<void> {
  try {
    const [serverInfo, teamInfo] = await Promise.all([
      rustplus.getServerInfo(),
      rustplus.getTeamInfo()
    ])
    const text = formatBotActivityText(serverInfo, teamInfo)
    await client.user?.setActivity(text, { type: 'PLAYING' })
    log.debug({ text }, 'Bot activity updated')
  } catch (err) {
    log.error(err)
  }
}

let timeoutId: NodeJS.Timeout | undefined

function updateBotActivityLoop(client: Discord.Client): void {
  if (timeoutId) clearInterval(timeoutId)
  void updateBotActivity(client)
  timeoutId = setTimeout(
    () => updateBotActivityLoop(client),
    BOT_STATUS_UPDATE_INTERVAL
  )
}

async function getBotOwnerDiscordUser(
  client: Discord.Client
): Promise<Discord.User> {
  const user = await client.users.fetch(process.env.DISCORD_OWNER_USER_ID!)
  if (!user) {
    log.error({ userId: process.env.DISCORD_OWNER_USER_ID })
    throw new Error('Could not find discord bot owner user')
  } else {
    return user
  }
}

const sendServerPairingMessage = (
  client: Discord.Client,
  isReadyP: Promise<void>
) => async (pairing: ServerPairingNotificationData) => {
  await isReadyP
  const user = await getBotOwnerDiscordUser(client)
  const msg = await user.send(formatServerPairing(pairing))
  try {
    const reactions = await msg.awaitReactions(() => true, {
      max: 1,
      time: 60000
    })
    if (reactions.array().length) {
      log.info('Got reaction, switching to server')
      // TODO: This could just now use id by getting server from the caller
      await rustplus.connectToServer({
        host: pairing.body.ip,
        port: pairing.body.port
      })
      await msg.react('✅')
    }
  } catch (err) {
    log.error(err)
  }
}

const sendEntityPairingMessage = (
  client: Discord.Client,
  isReadyP: Promise<void>
) => async (
  pairing: EntityPairingNotificationData
): Promise<Discord.Message> => {
  await isReadyP
  const user = await getBotOwnerDiscordUser(client)
  return user.send(formatEntityPairing(pairing))
}

const sendAlarmMessage = (
  client: Discord.Client,
  isReadyP: Promise<void>
) => async (
  channelId: string,
  alert: rustplus.SmartAlarmNotificationData,
  teamInfo: AppTeamInfo,
  baseLocation?: XY
): Promise<void> => {
  await isReadyP
  const channel = client.channels.cache.get(channelId)
  if (channel?.isText()) {
    await channel.send(formatSmartAlarmAlert(alert, teamInfo, baseLocation))
  }
}

const sendOrEditMessage = (
  client: Discord.Client,
  isReadyP: Promise<void>
) => async (
  messageOpts: Discord.MessageOptions,
  channelId: string,
  messageId?: string
): Promise<Discord.Message | undefined> => {
  await isReadyP
  const channel = client.channels.cache.get(channelId)
  if (!channel) {
    log.info({ channelId }, 'Could not find channel')
    return
  }
  if (!channel?.isText()) throw new Error('Expected a text channel')
  if (messageId) {
    const message = await channel.messages.fetch(messageId)
    return message.edit(messageOpts)
  } else {
    return channel.send({ ...messageOpts, split: false })
  }
}

const sendOrEditUpkeepMessage = (
  client: Discord.Client,
  isReadyP: Promise<void>
) => async (
  serverInfo: ServerInfo,
  entities: EntityWithInfo[],
  channelId: string,
  messageId?: string
): Promise<Discord.Message | undefined> => {
  return await sendOrEditMessage(client, isReadyP)(
    formatEntitiesUpkeep(serverInfo, entities),
    channelId,
    messageId
  )
}

export type DiscordAPI = {
  client: Discord.Client
  sendServerPairingMessage: ReturnType<typeof sendServerPairingMessage>
  sendEntityPairingMessage: ReturnType<typeof sendEntityPairingMessage>
  sendAlarmMessage: ReturnType<typeof sendAlarmMessage>
  sendOrEditUpkeepMessage: ReturnType<typeof sendOrEditUpkeepMessage>
  sendOrEditMessage: ReturnType<typeof sendOrEditMessage>
  isReadyP: Promise<void>
}

export const isMessageReply = (msg: Discord.Message): boolean =>
  Boolean(msg.reference?.messageID)

export default function start(): DiscordAPI {
  // partials are needed for listening to emoji reactions on old messages
  const client = new Discord.Client({ partials: ['MESSAGE', 'REACTION'] })
  const token = process.env.DISCORD_BOT_TOKEN!
  if (!token) {
    throw new Error('Discord bot token not set, aborting...')
  }

  async function onMapEvent(mapEvent: rustplus.MapEvent) {
    const { discordEventsChannelId } = await rustplus.getConfig()
    if (!discordEventsChannelId) return

    if (
      ((mapEvent.type === 'CRATE_SPAWNED' || mapEvent.type === 'CRATE_GONE') &&
        mapEvent.data.onCargoShip) ||
      mapEvent.type === 'CARGO_SHIP_LEFT'
    )
      return

    const channel = client.channels.cache.get(discordEventsChannelId)
    if (channel?.isText()) return channel.send(formatMapEvent(mapEvent))
  }

  function onRustSocketConnected() {
    updateBotActivityLoop(client)
  }

  const isReadyP = new Promise<void>((resolve) => {
    client.on('ready', async () => {
      resolve()
      log.info(`Logged in as ${client.user?.tag}!`)

      rustplus.events.removeListener('mapEvent', onMapEvent)
      rustplus.events.on('mapEvent', onMapEvent)

      rustplus.events.removeListener('connected', onRustSocketConnected)
      rustplus.events.on('connected', onRustSocketConnected)

      // The promise may not exist if there's configuration missing at start
      // We need this because rust server is connected to before event above is bound
      void rustplus.socketConnectedP
        ?.then(onRustSocketConnected)
        .catch(log.error)
    })
  })

  client.on('message', (msg) => {
    ;(async () => {
      const { content } = msg
      const match = content.match(/^(\/[^\s]+)(?:\s([\s\S]+))?/)
      const command = match?.[1]
      const text = match?.[2]
      const commandHandler = command && commands(client)[command]
      if (commandHandler) return commandHandler(text, msg, updateRepliesList)
      await handleServerEmbedReply(msg)
    })().catch((err) => {
      log.error(err)
    })
  })

  void client.login(token)

  const updateRepliesList = initUpdateLoop<Discord.Message>(
    () => updatedServerListReplies,
    (value) => {
      updatedServerListReplies = value
    },
    updateServerListMessage,
    (msg) => msg.channel.id
  )

  return {
    client,
    sendServerPairingMessage: sendServerPairingMessage(client, isReadyP),
    sendEntityPairingMessage: sendEntityPairingMessage(client, isReadyP),
    sendOrEditUpkeepMessage: sendOrEditUpkeepMessage(client, isReadyP),
    sendAlarmMessage: sendAlarmMessage(client, isReadyP),
    sendOrEditMessage: sendOrEditMessage(client, isReadyP),
    isReadyP
  }
}

export function findEmojiIdByName(
  client: Discord.Client,
  name: string
): string | undefined {
  const emoji = client.emojis.cache.find((emoji) => emoji.name === name)
  return emoji?.id
}
