import RustPlus from '@liamcottle/rustplus.js'
import * as t from 'io-ts'
import { validate } from '../validate'
import log from '../logger'
import {
  AppBroadcast,
  AppEntityInfo,
  AppInfo,
  AppMap,
  AppMapMarkers,
  AppMarker,
  AppTeamInfo,
  AppTime,
  ServerHostPort,
  ServerInfo,
  isMessageBroadcast
} from './types'
import protobuf, { Message } from 'protobufjs'
import { events, isEntityChangedBroadcast } from './'
import { Server } from './server'

export let socket: any
export let socketConnectedP: Promise<void>
export let socketConnected = false
export let connectedServer: ServerHostPort | undefined

const RUSTPLUS_PROTO_PATH = require.resolve(
  '@liamcottle/rustplus.js/rustplus.proto'
)

async function parseResponse<T>(
  type: t.Decoder<unknown, T>,
  response: Message<any>
): Promise<T> {
  const proto = await protobuf.load(RUSTPLUS_PROTO_PATH)
  const AppResponse = proto.lookupType('rustplus.AppResponse')
  try {
    return validate(
      type,
      AppResponse.toObject(response, {
        longs: String,
        enums: String,
        bytes: String
      })
    )
  } catch (err) {
    log.error(response, 'Failed to validate response')
    throw new Error(err)
  }
}

async function parseBroadcast<T>(
  type: t.Decoder<unknown, T>,
  broadcast: Message<any>
): Promise<T> {
  const proto = await protobuf.load(RUSTPLUS_PROTO_PATH)
  const AppBroadcast = proto.lookupType('rustplus.AppBroadcast')
  try {
    return validate(
      type,
      AppBroadcast.toObject(broadcast, {
        longs: String,
        enums: String,
        bytes: String
      })
    )
  } catch (err) {
    log.error(broadcast, 'Failed to validate broadcast message')
    throw new Error(err)
  }
}

export async function sendRequestAsync(...args: any[]): Promise<any> {
  log.debug(args?.[0], 'Sending rustplus request')
  if (socketConnectedP) await socketConnectedP
  else throw new Error('Rust socket not connected')
  return socket.sendRequestAsync(...args)
}

export async function setEntityValueAsync(
  entityId: number,
  value: any
): Promise<unknown> {
  return sendRequestAsync({
    entityId: entityId,
    setEntityValue: {
      value: value
    }
  })
}

export async function getEntityInfo(entityId: number): Promise<AppEntityInfo> {
  return parseResponse(
    t.type({ seq: t.number, entityInfo: AppEntityInfo }),
    await sendRequestAsync({
      entityId,
      getEntityInfo: {}
    })
  ).then((res) => res.entityInfo)
}

export async function getServerInfo(): Promise<ServerInfo> {
  return parseResponse(
    t.type({ seq: t.number, info: AppInfo }),
    await sendRequestAsync({ getInfo: {} })
  ).then((res) => ({
    ...res.info,
    ...connectedServer!
  }))
}

export async function getTime(): Promise<AppTime> {
  return parseResponse(
    t.type({ seq: t.number, time: AppTime }),
    await sendRequestAsync({ getTime: {} })
  ).then((res) => res.time)
}

export async function getTeamInfo(): Promise<AppTeamInfo> {
  return parseResponse(
    t.type({ seq: t.number, teamInfo: AppTeamInfo }),
    await sendRequestAsync({ getTeamInfo: {} })
  ).then((res) => res.teamInfo)
}

export async function getMap(): Promise<AppMap> {
  return parseResponse(
    t.type({ seq: t.number, map: AppMap }),
    await sendRequestAsync({ getMap: {} })
  ).then((res) => res.map)
}

export async function getMapMarkers(): Promise<AppMarker[]> {
  return parseResponse(
    t.type({ seq: t.number, mapMarkers: AppMapMarkers }),
    await sendRequestAsync({ getMapMarkers: {} })
  ).then((res) => res.mapMarkers.markers)
}

let connectAttempts = 0
let backOffDelayTimeout: NodeJS.Timeout
let onSocketDisconnected: (() => void) | undefined

// NOTE: The websocket will connect with incorrect player token and steam id,
// you have to request some data to check if the credentials work
export async function listen(server: Server) {
  if (socket) {
    log.info('Disconnecting existing socket')
    clearTimeout(backOffDelayTimeout)
    socket.removeListener('disconnected', onSocketDisconnected)
    socket.disconnect()
  }

  socket = new RustPlus(
    server.host,
    server.port,
    server.playerSteamId,
    server.playerToken
  )

  socket.on('error', (err: Error) => {
    log.error(err, 'Rust websocket error')
  })

  socket.on('connecting', () => {
    connectAttempts += 1
    log.info('Rust websocket connecting')
  })

  onSocketDisconnected = () => {
    socketConnected = false
    const backOffDelay = Math.min(10000, 10 ** connectAttempts)
    log.error(`Rust websocket disconnected, reconnecting in ${backOffDelay}ms`)
    backOffDelayTimeout = global.setTimeout(() => {
      void listen(server)
    }, backOffDelay)
  }

  socket.on('disconnected', onSocketDisconnected)
  socket.on('message', async (message: unknown) => {
    if (isMessageBroadcast(message)) {
      log.debug(message.broadcast, 'Got broadcast')
      const broadcast = await parseBroadcast(AppBroadcast, message.broadcast)
      if (isEntityChangedBroadcast(broadcast)) {
        events.emit('entityChanged', broadcast.entityChanged)
      } else {
        events.emit('teamChanged', broadcast.teamChanged)
      }
    }
  })

  socket.connect()

  socketConnectedP = new Promise<void>((resolve) => {
    socket.once('connected', async () => {
      connectedServer = server
      socketConnected = true
      connectAttempts = 0
      resolve() // sendRequestAsync pends on this promise
      try {
        const info = await getServerInfo()
        events.emit('connected', info, server)
      } catch (err) {
        log.error(err)
      }
    })
  })

  await socketConnectedP
}
