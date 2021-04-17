import Discord from 'discord.js'
import _ from 'lodash'
import { TypedEmitter } from 'tiny-typed-emitter'
import db from '../db'
import { DiscordAPI } from '../discord'
import {
  formatEntityPairing,
  formatServerPairing,
  formatSmartAlarmAlert
} from '../discord/formatting'
import { logAndCapture } from '../errors'
import log from '../logger'
import { configure, getConfig, initEmptyConfig } from './config'
import {
  createEntityFromPairing,
  handleEntityHandleUpdateReply,
  updateEntity
} from './entity'
import { fcmListen } from './fcm'
import { saveMapIfNotExist } from './map'
import { trackMapEvents } from './map-events'
import { onMapEvent } from './map-events/on-map-event'
import { updateMapEventDiscordMessagesLoop } from './map-events/update-discord-messages'
import * as socket from './rustplus-socket'
import {
  createWipeIfNotExist,
  getCurrentServer,
  getServerId,
  getWipeById,
  updateWipeBaseLocation,
  upsertServer
} from './server'
import { initSwitchesChannel } from './switch-channel'
import {
  isServerPairingNotification,
  RustPlusEvents,
  ServerHostPort,
  ServerInfo,
  ServerPairingNotificationData
} from './types'
import { trackUpkeepLoop } from './upkeep'

export * from './config'
export * from './rustplus-socket'
export * from './types'

type State = {
  serverInfo?: ServerInfo
  wipeId?: number
}

export const state: State = {}
export const events = new TypedEmitter<RustPlusEvents>()

export async function init(discord: DiscordAPI): Promise<void> {
  discord.client.on('message', async (msg) => {
    try {
      await handleEntityHandleUpdateReply(events, msg)
    } catch (err) {
      logAndCapture(err)
    }
  })

  events.on('alarm', async (alert) => {
    log.info(alert, 'Got an alert')
    // There's no way to connect an alert from FCM notification to a specific
    // smart alarm entity, so to make alert send a message to discord, the
    // title should contain ! at start of title
    if (!alert.title.startsWith('!')) return
    if (!state.wipeId) return
    const [config, teamInfo, wipe] = await Promise.all([
      getConfig(),
      socket.getTeamInfo(),
      getWipeById(state.wipeId)
    ])
    const { discordAlertsChannelId } = config
    if (!discordAlertsChannelId) return
    await discord.sendMessage(
      discordAlertsChannelId,
      formatSmartAlarmAlert(alert, teamInfo, wipe.baseLocation ?? undefined)
    )
  })

  events.on('pairing', async (pairing) => {
    log.info(pairing.body, `Got a request to pair ${pairing.body.type}`)

    if (isServerPairingNotification(pairing)) {
      await upsertServer({
        host: pairing.body.ip,
        port: pairing.body.port,
        playerToken: pairing.body.playerToken,
        playerSteamId: pairing.body.playerId
      })
      await sendServerPairingMessage(discord, pairing).catch(logAndCapture)
    } else {
      const entity = await createEntityFromPairing(pairing.body)
      const msg = await discord.sendMessageToBotOwner(
        formatEntityPairing(pairing)
      )
      await updateEntity({ ...entity, discordPairingMessageId: msg.id })
      events.emit('entityPaired', entity)
    }
  })

  events.on('mapEvent', (mapEvent) => onMapEvent(discord, mapEvent))

  events.on('connected', async (serverInfo) => {
    log.info(serverInfo, 'Connected to rust server')
    const wipe = await createWipeIfNotExist(serverInfo)
    state.wipeId = wipe.wipeId
    state.serverInfo = serverInfo
    await saveMapIfNotExist(serverInfo, state.wipeId)
    void trackMapEvents(serverInfo, wipe.wipeId, events)
    void updateMapEventDiscordMessagesLoop(discord, wipe.wipeId)
    void trackUpkeepLoop(discord, serverInfo, state.wipeId)
    void initSwitchesChannel(discord, events, state.wipeId)
  })

  await initEmptyConfig()

  let config
  try {
    config = await getConfig()
  } catch (err) {
    log.warn(err, 'Failed to get rustplus configuration')
    return
  }

  if (config.fcmCredentials) await fcmListen(config.fcmCredentials)

  const currentServer = await getCurrentServer()
  if (currentServer) void socket.listen(currentServer)
}

export async function connectToServer(server: ServerHostPort) {
  return db.tx(async (t) => {
    const id = await getServerId(server, t)
    await configure({ currentServerId: id }, t)
    const currentServer = await getCurrentServer(t)
    if (currentServer) void socket.listen(currentServer)
  })
}

export async function setBaseLocation(
  reply: typeof Discord.Message.prototype.reply
) {
  const server = await getCurrentServer()
  if (state.wipeId && server) {
    const teamInfo = await socket.getTeamInfo()
    const botOwnerMember = teamInfo.members.find(
      (m) => m.steamId === server.playerSteamId
    )!
    await updateWipeBaseLocation(
      state.wipeId,
      _.pick(botOwnerMember, ['x', 'y'])
    )
    await reply(
      `Base location updated to current location of ${botOwnerMember.name}`
    )
  } else {
    await reply('Not connected to a server')
  }
}

async function sendServerPairingMessage(
  discord: DiscordAPI,
  pairing: ServerPairingNotificationData
) {
  const msg = await discord.sendMessageToBotOwner(formatServerPairing(pairing))
  const reactions = await msg.awaitReactions(() => true, {
    max: 1,
    time: 60000
  })
  if (reactions.array().length) {
    log.info('Got reaction, switching to server')
    await connectToServer({
      host: pairing.body.ip,
      port: pairing.body.port
    })
    await msg.react('✅')
  }
}
