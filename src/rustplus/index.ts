import Discord from 'discord.js'
import { promises as fs } from 'fs'
import _ from 'lodash'
import * as path from 'path'
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
import { trackMapEvents } from './map-events'
import { onMapEvent } from './map-events/on-map-event'
import { updateMapEventDiscordMessagesLoop } from './map-events/update-discord-messages'
import * as socket from './socket'
import { makeScriptApi } from './script-api'
import {
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
export * from './types'
export * as socket from './socket'

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
  events.on('player', (event) => {
    log.info(event, 'Got player event')
  })

  events.on('connected', async (serverInfo, server, wipeId) => {
    log.info(serverInfo, 'Connected to rust server')
    state.wipeId = wipeId
    state.serverInfo = serverInfo
    void trackMapEvents(serverInfo, wipeId, events)
    void updateMapEventDiscordMessagesLoop(discord, wipeId)
    void trackUpkeepLoop(discord, serverInfo, wipeId)
    void initSwitchesChannel(discord, events)
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
  await loadScripts()
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

async function loadScripts() {
  const scriptApi = makeScriptApi()
  const scriptsDir = path.join(__dirname, 'scripts')
  const scripts = await fs.readdir(scriptsDir)
  await Promise.all(
    scripts.map((script) =>
      import(path.join(scriptsDir, script)).then((module) => {
        module.default(scriptApi)
      })
    )
  )
  log.info(scripts, 'Scripts loaded')
}
