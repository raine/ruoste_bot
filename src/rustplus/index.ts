import Discord from 'discord.js'
import { promises as fs } from 'fs'
import _ from 'lodash'
import * as path from 'path'
import { TypedEmitter } from 'tiny-typed-emitter'
import db, { DbError } from '../db'
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
import { makeScriptAPI } from './script-api'
import {
  getCurrentServer,
  getCurrentWipe,
  getServerId,
  getWipeById,
  updateWipeBaseLocation,
  upsertServer,
  Wipe
} from './server'
import { initSwitchesChannel } from './switch-channel'
import {
  isServerPairingNotification,
  Member,
  RustPlusEvents,
  ServerHostPort,
  ServerInfo,
  ServerPairingNotificationData
} from './types'
import { trackUpkeepLoop } from './upkeep'
import { EitherAsync } from 'purify-ts/EitherAsync'
import { Maybe } from 'purify-ts/Maybe'

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
      const updatedEntity = await updateEntity({
        ...entity,
        discordPairingMessageId: msg.id
      })
      events.emit('entityPaired', updatedEntity)
    }
  })

  events.on('mapEvent', (mapEvent) => onMapEvent(discord, mapEvent))
  events.on('killedWhileOffline', async (event) => {
    log.info({ ...event, teamInfo: await socket.getTeamInfo() }, 'Killed')
  })

  events.on('connected', async (serverInfo, server, wipeId) => {
    log.info(serverInfo, 'Connected to rust server')
    state.wipeId = wipeId
    state.serverInfo = serverInfo
    void trackMapEvents(serverInfo, wipeId, events)
    void updateMapEventDiscordMessagesLoop(discord, wipeId)
    void trackUpkeepLoop(discord, serverInfo, wipeId, events)
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
  await loadScripts(discord)
}

export async function connectToServer(server: ServerHostPort) {
  return db.tx(async (t) =>
    EitherAsync<DbError | 'error1' | 'error2', void>(
      async ({ liftEither, fromPromise }) => {
        const id = await liftEither(
          await fromPromise(
            getServerId(server, t).map((m) => m.toEither('error1'))
          )
        )
        await configure({ currentServerId: id }, t)
        const currentServer = await liftEither(
          await fromPromise(
            getCurrentServer(t).map((m) => m.toEither('error2'))
          )
        )
        void socket.listen(currentServer)
      }
    )
  )
}

// const x = getServerId(server, t).map((x) =>
//   x.toEither('Could not get server')
// )
// return x
// await configure({ currentServerId: id }, t)
// const currentServer = await getCurrentServer(t)
// if (currentServer) void socket.listen(currentServer)

export function setBaseLocation(reply: typeof Discord.Message.prototype.reply) {
  return EitherAsync<Error, { wipe: Wipe; botOwner: Member }>(
    async ({ fromPromise, liftEither }) => {
      const server = await fromPromise(getCurrentServer())
      const wipe = await fromPromise(getCurrentWipe())
      const teamInfo = await fromPromise(socket.getTeamInfoE())
      const botOwner = await liftEither(
        Maybe.fromNullable(
          teamInfo.members.find((m) => m.steamId === server.playerSteamId)
        ).toEither(new Error('Unable to find bot owner in team'))
      )
      return { wipe, botOwner }
    }
  )
    .ifRight(async ({ wipe, botOwner }) => {
      await updateWipeBaseLocation(wipe.wipeId, _.pick(botOwner, ['x', 'y']))
      await reply(
        `Base location updated to current location of ${botOwner.name}`
      )
    })
    .ifLeft((err) => {
      log.error(err, 'Failed to update based location')
      return reply('Could not update base location')
    })
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

export async function setSwitch(entityId: number, value: boolean) {
  return socket.setEntityValueAsync(entityId, value)
}

async function loadScripts(discord: DiscordAPI) {
  const scriptsDir = path.join(__dirname, 'scripts')
  const scripts = (await fs.readdir(scriptsDir)).filter(
    (script) => !script.includes('.example.')
  )
  await Promise.all(
    scripts.map((script) =>
      import(path.join(scriptsDir, script))
        .then((module) => module.default(makeScriptAPI(discord)))
        .catch((err) => {
          log.error(err, 'Failed to load script')
        })
    )
  )
  log.info(scripts, 'Scripts loaded')
}
