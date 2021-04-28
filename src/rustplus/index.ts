import Discord from 'discord.js'
import * as AP from 'fp-ts/lib/Apply'
import * as E from 'fp-ts/lib/Either'
import { identity, pipe } from 'fp-ts/lib/function'
import * as T from 'fp-ts/lib/Task'
import { findFirst } from 'fp-ts/lib/Array'
import * as TE from 'fp-ts/lib/TaskEither'
import { promises as fs } from 'fs'
import * as path from 'path'
import { TypedEmitter } from 'tiny-typed-emitter'
import { noResultToError as noResultAsError } from '../db'
import { DiscordAPI } from '../discord'
import {
  formatEntityPairing,
  formatServerPairing,
  formatSmartAlarmAlert
} from '../discord/formatting'
import { logAndCapture, toUnexpectedError } from '../errors'
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
import { makeScriptAPI } from './script-api'
import {
  getCurrentServer,
  getCurrentWipe,
  getServerId,
  getWipeById,
  updateWipeBaseLocation,
  upsertServer
} from './server'
import * as socket from './socket'
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
import _ from 'lodash'

export * from './config'
export * as socket from './socket'
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
      const updatedEntity = await updateEntity({
        ...entity,
        discordPairingMessageId: msg.id
      })
      events.emit('entityPaired', updatedEntity)
    }
  })

  events.on('mapEvent', (mapEvent) => onMapEvent(discord, mapEvent))
  events.on(
    'killedWhileOffline',
    (event): Promise<void> => {
      return pipe(
        socket.getTeamInfoE(),
        T.map(
          E.fold(
            (err) => {
              log.error(err)
            },
            (teamInfo) => {
              log.info({ ...event, teamInfo }, 'Killed')
            }
          )
        ),
        (task) => task()
      )
    }
  )

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

export const connectToServer = (server: ServerHostPort): Promise<void> => {
  const task = pipe(
    noResultAsError(getServerId(server)),
    TE.chainW((serverId) =>
      TE.tryCatch(
        () => configure({ currentServerId: serverId }),
        toUnexpectedError
      )
    ),
    TE.chainW(() => noResultAsError(getCurrentServer())),
    T.map(
      E.fold(
        (err) => log.error(err),
        (server) => socket.listen(server)
      )
    )
  )

  return task()
}

export function setBaseLocation(
  reply: typeof Discord.Message.prototype.reply
): Promise<void> {
  return pipe(
    AP.sequenceT(TE.taskEither)(
      noResultAsError(getCurrentServer()),
      noResultAsError(getCurrentWipe()),
      socket.getTeamInfoE()
    ),
    TE.chainW(([server, wipe, teamInfo]) => {
      const botOwner = findFirst<Member>(
        (m) => m.steamId === server.playerSteamId
      )(teamInfo.members)

      return pipe(
        botOwner,
        TE.fromOption(() => new Error('Bot owner not in team')),
        TE.map((botOwner) => ({ botOwner, wipe }))
      )
    }),
    TE.chain(({ botOwner, wipe }) =>
      TE.tryCatch(async () => {
        await updateWipeBaseLocation(wipe.wipeId, _.pick(botOwner, ['x', 'y']))
        await reply(
          `Base location updated to current location of ${botOwner.name}`
        )
      }, E.toError)
    ),
    TE.orElse((err) =>
      TE.tryCatch(async () => {
        log.error(err, 'Failed to update based location')
        await reply('Could not update base location')
      }, E.toError)
    ),
    T.map(E.fold((err: any) => log.error(err), identity)),
    (task) => task()
  )
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
  return socket.setEntityValueE(entityId, value)()
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
