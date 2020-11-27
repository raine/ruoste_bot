const Sentry = require('@sentry/node')

import * as Discord from 'discord.js'
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
import {
  formatServerEmbed,
  formatServerListReply,
  formatServerListReplyWithUpdatedAt,
  formatUpcomingWipeList
} from './formatting/discord'
import { initUpdateLoop, ServerListReply } from './update-loop'
import { getNextWipes } from './get-next-wipes'
import { parseMaxGroupOption } from './input'

type DiscordServerListReply = ServerListReply<Discord.Message>
let updatedServerListReplies: DiscordServerListReply[] = []

const commands = {
  '/wipes': async (
    msg: Discord.Message,
    updateRepliesList: (
      servers: ListServer[],
      sentMessage: Discord.Message,
      userMessage: Discord.Message
    ) => void
  ) => {
    const searchParams = formatSearchParams({
      maxGroup: parseMaxGroupOption(msg.content)
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
        msg.reply('something went wrong 😳')
      })
  },
  '/nextwipes': async (msg: Discord.Message) => {
    const sent = await msg.channel.send({
      embed: { description: 'Loading...' }
    })

    getNextWipes()
      .skip(1)
      .throttle(1000)
      .onValue(({ serverCount, fetchedCount, servers }) => {
        sent.edit({
          embed: formatUpcomingWipeList(serverCount, fetchedCount, servers)
        })
      })
  }
}

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

export default function start() {
  const client = new Discord.Client()
  const token = process.env.DISCORD_BOT_TOKEN!
  if (!token) {
    log.error('discord bot token not set, aborting...')
    return
  }

  client.on('ready', () => {
    log.info(`logged in as ${client.user?.tag}!`)
  })

  client.on('message', (msg) => {
    ;(async () => {
      const text = msg.content
      const command = text.match(/(\/[^\s]+)/)?.[1] as
        | keyof typeof commands
        | undefined
      const commandHandler = command && commands[command]
      if (commandHandler) return commandHandler(msg, updateRepliesList)
      await handleServerEmbedReply(msg)
    })().catch((err) => {
      log.error(err)
    })
  })

  client.login(token)

  const updateRepliesList = initUpdateLoop<Discord.Message>(
    () => updatedServerListReplies,
    (value) => {
      updatedServerListReplies = value
    },
    updateServerListMessage,
    (msg) => msg.channel.id
  )
}
