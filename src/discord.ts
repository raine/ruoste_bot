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
  formatUpcomingWipeList,
  formatSmartAlarmAlert
} from './formatting/discord'
import { initUpdateLoop, ServerListReply } from './update-loop'
import { getNextWipes } from './get-next-wipes'
import { parseMaxGroupOption } from './input'
import * as rustplus from './rustplus'

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

const commands: (client: Discord.Client) => Commands = (client) => ({
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
        msg.reply('something went wrong 😳')
      })
  },
  '/nextwipes': async (text, msg) => {
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
          case 'server': {
            const [server, port] = value.split(':')
            await rustplus.configure({
              serverHost: server,
              serverPort: parseInt(port)
            })
            await msg.reply('Server updated!')
            updateBotActivityLoop(client)
            return
          }
          case 'steamid': {
            await rustplus.configure({ playerSteamId: value })
            await msg.reply('Player steam id updated!')
            updateBotActivityLoop(client)
            return
          }
          case 'playertoken': {
            await rustplus.configure({ playerToken: parseInt(value) })
            await msg.reply('Player token updated!')
            updateBotActivityLoop(client)
            return
          }
          case 'alerts_channel': {
            await rustplus.configure({ discordAlertsChannelId: value })
            await msg.reply('Alerts channel updated!')
            return
          }
        }
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
    const teamOnlineCount = teamInfo.members.filter((member) => member.isOnline)
      .length
    const teamOnlineText = `${teamOnlineCount}/${teamInfo.members.length}`
    const serverPlayersText = `${serverInfo.players}/${serverInfo.maxPlayers} players`
    const activityText = `${teamOnlineText} (${serverPlayersText})`
    await client.user?.setActivity(activityText, { type: 'PLAYING' })
    log.info('Bot activity updated')
  } catch (err) {
    log.error(err)
  }
}

let timeoutId: NodeJS.Timeout | undefined

function updateBotActivityLoop(client: Discord.Client): void {
  if (timeoutId) clearInterval(timeoutId)
  updateBotActivity(client)
  timeoutId = setTimeout(
    () => updateBotActivityLoop(client),
    BOT_STATUS_UPDATE_INTERVAL
  )
}

export default function start() {
  const client = new Discord.Client()
  const token = process.env.DISCORD_BOT_TOKEN!
  if (!token) {
    log.error('Discord bot token not set, aborting...')
    return
  }

  async function onSmartAlarmAlert(alert: rustplus.SmartAlarmNotificationData) {
    const { discordAlertsChannelId } = await rustplus.getConfig()
    if (discordAlertsChannelId) {
      const channel = client.channels.cache.get(discordAlertsChannelId)
      if (channel?.isText()) channel.send(formatSmartAlarmAlert(alert))
    }
  }

  client.on('ready', () => {
    log.info(`Logged in as ${client.user?.tag}!`)

    rustplus.events.removeListener('alarm', onSmartAlarmAlert)
    rustplus.events.on('alarm', onSmartAlarmAlert)

    // The promise may not exist if there's configuration missing at start
    rustplus.socketConnectedP
      ?.then(() => updateBotActivityLoop(client))
      .catch((err) => log.error(err))
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
