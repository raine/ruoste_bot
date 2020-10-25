const Sentry = require('@sentry/node')

import * as Discord from 'discord.js'
import {
  formatServerListUrl,
  getWipedServersCached1m,
  ListServer,
  SERVER_SEARCH_PARAMS
} from './just-wiped'
import log from './logger'
import {
  formatServerListReply,
  formatServerListReplyWithUpdatedAt
} from './formatting/discord'
import { initUpdateLoop, ServerListReply } from './update-loop'

type DiscordServerListReply = ServerListReply<Discord.Message>
let updatedServerListReplies: DiscordServerListReply[] = []

const commands = {
  '/wipes': async (
    msg: Discord.Message,
    updateRepliesList: (
      servers: ListServer[],
      sentMessage: Discord.Message
    ) => void
  ) => {
    getWipedServersCached1m(SERVER_SEARCH_PARAMS)
      .then((servers) =>
        msg.channel
          .send({
            embed: formatServerListReply(
              servers as any,
              formatServerListUrl(SERVER_SEARCH_PARAMS)
            )
          })
          .then((sent) => {
            updateRepliesList(servers, sent)
          })
      )
      .catch((err) => {
        Sentry.captureException(err)
        log.error(err, 'failed to reply with servers')
        msg.reply('something went wrong 😳')
      })
  }
}

const updateServerListMessage = async (
  msg: Discord.Message
): Promise<ListServer[]> => {
  const servers = await getWipedServersCached1m(SERVER_SEARCH_PARAMS)
  await msg.edit({
    embed: formatServerListReplyWithUpdatedAt(
      servers,
      formatServerListUrl(SERVER_SEARCH_PARAMS)
    )
  })
  return servers
}

export default function start() {
  const client = new Discord.Client()
  const token = process.env.DISCORD_BOT_TOKEN!
  if (!token) {
    log.error('Discord bot token not set, aborting...')
    return
  }

  client.on('ready', () => {
    log.info(`logged in as ${client.user?.tag}!`)
  })

  client.on('message', (msg) => {
    const command = commands[msg.content as keyof typeof commands]
    if (command) command(msg, updateRepliesList)
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
