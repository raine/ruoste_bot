import * as Discord from 'discord.js'
import * as TE from 'fp-ts/lib/TaskEither'
import * as T from 'fp-ts/lib/Task'
import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import { DateTime, Interval } from 'luxon'
import { logAndCapture, toUnexpectedError } from '../errors'
import { getNextWipes } from '../get-next-wipes'
import { parseMaxGroupOption } from '../input'
import {
  formatSearchParams,
  formatServerListUrl,
  getIdFromServerLink,
  getServerAddressCached1h,
  getServerCached1m,
  getWipedServersCached1m,
  ListServer,
  SERVER_SEARCH_PARAMS
} from '../just-wiped'
import log from '../logger'
import * as rustplus from '../rustplus'
import { initUpdateLoop, ServerListReply } from '../update-loop'
import {
  formatBotActivityText,
  formatServerEmbed,
  formatServerListReply,
  formatServerListReplyWithUpdatedAt,
  formatUpcomingWipeList
} from './formatting'

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
        logAndCapture(err, 'failed to reply with servers')
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
        const fail = () => msg.reply('Could not update base location')
        const success = (botOwnerName: string) =>
          msg.reply(
            `Base location updated to current location of ${botOwnerName}`
          )
        await pipe(
          rustplus.setBaseLocation(),
          T.chain((e) =>
            TE.tryCatch(() => E.fold(fail, success)(e), toUnexpectedError)
          ),
          TE.orElse((err) => TE.leftIO(() => log.error(err)))
        )()
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
      rustplus.socket.getServerInfo(),
      rustplus.socket.getTeamInfo()
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

const sendMessageToBotOwner = (
  client: Discord.Client,
  isReadyP: Promise<void>
) => async (
  messageOpts: Discord.MessageOptions | Discord.StringResolvable
): Promise<Discord.Message> => {
  await isReadyP
  const user = await getBotOwnerDiscordUser(client)
  return user.send(messageOpts)
}

const sendMessage = (client: Discord.Client, isReadyP: Promise<void>) => async (
  channelId: string,
  messageOpts: Discord.MessageOptions | Discord.StringResolvable
): Promise<Discord.Message> => {
  await isReadyP
  const channel = client.channels.cache.get(channelId)
  if (!channel) {
    log.error({ channelId }, 'Could not find channel')
    throw new Error('Could not find a channel')
  }
  if (!channel?.isText()) throw new Error('Expected a text channel')
  return channel.send(messageOpts)
}

const sendOrEditMessage = (
  client: Discord.Client,
  isReadyP: Promise<void>
) => async (
  channelId: string,
  messageOpts: Discord.MessageOptions | Discord.StringResolvable,
  messageId?: string
): Promise<Discord.Message | undefined> => {
  await isReadyP
  const channel = client.channels.cache.get(channelId)
  if (!channel) {
    log.info({ channelId }, 'Could not find channel')
    throw new Error('Could not find channel')
  }
  if (!channel?.isText()) throw new Error('Expected a text channel')
  if (messageId) {
    const message = await channel.messages.fetch(messageId)
    return message.edit(messageOpts)
  } else {
    if (typeof messageOpts === 'string') {
      return channel.send(messageOpts)
    } else {
      return channel.send({ ...messageOpts, split: false })
    }
  }
}

export type DiscordAPI = {
  client: Discord.Client
  sendMessage: ReturnType<typeof sendMessage>
  sendOrEditMessage: ReturnType<typeof sendOrEditMessage>
  sendMessageToBotOwner: ReturnType<typeof sendMessageToBotOwner>
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

  function onRustSocketConnected() {
    updateBotActivityLoop(client)
  }

  const isReadyP = new Promise<void>((resolve) => {
    client.on('ready', async () => {
      resolve()
      log.info(`Logged in as ${client.user?.tag}!`)

      rustplus.events.removeListener('connected', onRustSocketConnected)
      rustplus.events.on('connected', onRustSocketConnected)

      // The promise may not exist if there's configuration missing at start
      // We need this because rust server is connected to before event above is bound
      void rustplus.socket.socketConnectedP
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
    })().catch(logAndCapture)
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
    sendMessage: sendMessage(client, isReadyP),
    sendOrEditMessage: sendOrEditMessage(client, isReadyP),
    sendMessageToBotOwner: sendMessageToBotOwner(client, isReadyP),
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
