import RustPlus from '@liamcottle/rustplus.js'
import * as t from 'io-ts'
import { validate } from '../validate'
import log from '../logger'
import { RustPlusConfig } from '.'
import protobuf, { Message } from 'protobufjs'
import { events } from './'

export let socket: any
export let socketConnectedP: Promise<void>
export let socketConnected = false

const RUSTPLUS_PROTO_PATH = require.resolve(
  '@liamcottle/rustplus.js/rustplus.proto'
)

const AppResponse = (propName: string, dataType: any) =>
  t.type({
    seq: t.number,
    [propName]: dataType
  })

const AppInfo = t.type({
  name: t.string,
  headerImage: t.string,
  url: t.string,
  map: t.string,
  mapSize: t.number,
  wipeTime: t.number,
  players: t.number,
  maxPlayers: t.number,
  queuedPlayers: t.number,
  seed: t.number,
  salt: t.number
})

export type AppInfo = t.TypeOf<typeof AppInfo>

const AppTime = t.type({
  dayLengthMinutes: t.number,
  timeScale: t.number,
  sunrise: t.number,
  sunset: t.number,
  time: t.number
})

export type AppTime = t.TypeOf<typeof AppTime>

const Member = t.type({
  steamId: t.unknown,
  name: t.string,
  x: t.number,
  y: t.number,
  isOnline: t.boolean,
  spawnTime: t.number,
  isAlive: t.boolean,
  deathTime: t.number
})

const AppTeamInfo = t.type({
  members: t.array(Member)
})

export type AppTeamInfo = t.TypeOf<typeof AppTeamInfo>

export const AppMarker = t.type({
  id: t.number,
  type: t.keyof({
    Crate: null,
    VendingMachine: null,
    Player: null,
    Explosion: null,
    CargoShip: null,
    CH47: null
  }),
  x: t.number,
  y: t.number,
  steamId: t.string,
  rotation: t.number,
  radius: t.number,
  name: t.union([t.string, t.undefined])
})

export type AppMarker = t.TypeOf<typeof AppMarker>

const AppMapMarkers = t.type({
  markers: t.array(AppMarker)
})

export type AppMapMarkers = t.TypeOf<typeof AppMapMarkers>

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

export async function sendRequestAsync(...args: any[]): Promise<any> {
  log.debug(args?.[0], 'Sending rustplus request')
  if (socketConnectedP) await socketConnectedP
  else throw new Error('Rust socket not connected')
  return socket.sendRequestAsync(...args)
}

export async function getServerInfo(): Promise<AppInfo> {
  return parseResponse(
    AppResponse('info', AppInfo),
    await sendRequestAsync({ getInfo: {} })
  ).then((res) => res.info)
}

export async function getTime(): Promise<AppTime> {
  return parseResponse(
    AppResponse('time', AppTime),
    await sendRequestAsync({ getTime: {} })
  ).then((res) => res.time)
}

export async function getTeamInfo(): Promise<AppTeamInfo> {
  return parseResponse(
    AppResponse('teamInfo', AppTeamInfo),
    await sendRequestAsync({ getTeamInfo: {} })
  ).then((res) => res.teamInfo)
}

export async function getMap(): Promise<any> {
  return parseResponse(
    AppResponse('map', t.any),
    await sendRequestAsync({ getMap: {} })
  ).then((res) => res.map)
}

export async function getMapMarkers(): Promise<AppMarker[]> {
  return parseResponse(
    AppResponse('mapMarkers', AppMapMarkers),
    await sendRequestAsync({ getMapMarkers: {} })
  ).then((res) => res.mapMarkers.markers)
}

let connectAttempts = 0
let backOffDelayTimeout: NodeJS.Timeout
let onSocketDisconnected: (() => void) | undefined

// NOTE: The websocket will connect with incorrect player token and steam id,
// you have to request some data to check if the credentials work
export async function listen(config: RustPlusConfig) {
  if (socket) {
    log.info('Disconnecting existing socket')
    clearTimeout(backOffDelayTimeout)
    socket.removeListener('disconnected', onSocketDisconnected)
    socket.disconnect()
  }

  socket = new RustPlus(
    config.serverHost,
    config.serverPort,
    config.playerSteamId,
    config.playerToken
  )

  if (
    !(
      config.serverHost &&
      config.serverPort &&
      config.playerSteamId &&
      config.playerToken
    )
  ) {
    log.error('Missing configuration for rustplus, not connecting')
    return
  }

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
    backOffDelayTimeout = setTimeout(() => {
      listen(config)
    }, backOffDelay)
  }

  socket.on('disconnected', onSocketDisconnected)

  socket.connect()

  socketConnectedP = new Promise<void>((resolve) => {
    socket.once('connected', () => {
      socketConnected = true
      connectAttempts = 0
      events.emit('connected')
      resolve()
    })
  })

  await socketConnectedP
}
