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
  formatSmartAlarmAlert,
  formatServerPairing,
  formatMapEvent
} from './formatting/discord'
import { initUpdateLoop, ServerListReply } from './update-loop'
import { getNextWipes } from './get-next-wipes'
import { parseMaxGroupOption } from './input'
import { Interval, DateTime } from 'luxon'
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
          case 'server': {
            const [server, port] = value.split(':')
            await rustplus.configure({
              serverHost: server,
              serverPort: parseInt(port)
            })
            await msg.reply('Server updated!')
            return
          }
          case 'steamid': {
            await rustplus.configure({ playerSteamId: value })
            await msg.reply('Player steam id updated!')
            return
          }
          case 'playertoken': {
            await rustplus.configure({ playerToken: parseInt(value) })
            await msg.reply('Player token updated!')
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
          default: {
            await msg.reply(`I don't know how to configure that`)
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

function formatBotActivityText(
  serverInfo: rustplus.AppInfo,
  teamInfo: rustplus.AppTeamInfo
): string {
  const teamOnlineCount = teamInfo.members.filter((member) => member.isOnline)
    .length
  const teamOnlineText = `${teamOnlineCount}/${teamInfo.members.length}`
  const serverPlayersText = `${serverInfo.players}/${serverInfo.maxPlayers} players`
  return `${teamOnlineText} (${serverPlayersText})`
}

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

export default function start() {
  const client = new Discord.Client()
  const token = process.env.DISCORD_BOT_TOKEN!
  if (!token) {
    log.error('Discord bot token not set, aborting...')
    return
  }

  async function onSmartAlarmAlert(alert: rustplus.SmartAlarmNotificationData) {
    const { discordAlertsChannelId } = await rustplus.getConfig()
    if (!discordAlertsChannelId) return

    const channel = client.channels.cache.get(discordAlertsChannelId)
    if (channel?.isText()) return channel.send(formatSmartAlarmAlert(alert))
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

  async function onPairing(pairing: rustplus.PairingNotificationData) {
    if (rustplus.isServerPairingNotification(pairing)) {
      const user = await client.users.fetch(process.env.DISCORD_OWNER_USER_ID!)
      if (user) {
        const msg = await user.send(formatServerPairing(pairing))
        try {
          await msg.awaitReactions(() => true, { max: 1, time: 60000 })
          log.info('Got reaction, switching to server')
          await rustplus.configure({
            serverHost: pairing.body.ip,
            serverPort: pairing.body.port,
            playerToken: pairing.body.playerToken,
            playerSteamId: pairing.body.playerId
          })
        } catch (err) {
          log.info(err)
        }
      } else {
        log.error(
          { userId: process.env.DISCORD_OWNER_USER_ID },
          'Could not find discord user'
        )
      }
    }
  }

  function onRustSocketConnected() {
    updateBotActivityLoop(client)
  }

  client.on('ready', () => {
    log.info(`Logged in as ${client.user?.tag}!`)

    rustplus.events.removeListener('alarm', onSmartAlarmAlert)
    rustplus.events.on('alarm', onSmartAlarmAlert)

    rustplus.events.removeListener('mapEvent', onMapEvent)
    rustplus.events.on('mapEvent', onMapEvent)

    rustplus.events.removeListener('pairing', onPairing)
    rustplus.events.on('pairing', onPairing)

    rustplus.events.removeListener('connected', onRustSocketConnected)
    rustplus.events.on('connected', onRustSocketConnected)

    // The promise may not exist if there's configuration missing at start
    // We need this because rust server is connected to before event above is bound
    void rustplus.socketConnectedP?.then(onRustSocketConnected).catch(log.error)
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
}
