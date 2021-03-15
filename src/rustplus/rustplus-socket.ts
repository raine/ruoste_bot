import RustPlus from '@liamcottle/rustplus.js'
import * as t from 'io-ts'
import { validateP } from '../validate'
import log from '../logger'
import { RustPlusConfig } from '.'

export let socket: any
export let socketConnectedP: Promise<void>

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

export async function sendRequestAsync(...args: any[]): Promise<any> {
  if (socketConnectedP) await socketConnectedP
  else throw new Error('Rust socket not connected')
  return socket.sendRequestAsync(...args)
}

export async function getServerInfo(): Promise<AppInfo> {
  return validateP(
    AppResponse('info', AppInfo),
    sendRequestAsync({ getInfo: {} })
  ).then((res) => res.info)
}

export async function getTime(): Promise<AppTime> {
  return validateP(
    AppResponse('time', AppTime),
    sendRequestAsync({ getTime: {} })
  ).then((res) => res.response.time)
}

export async function getTeamInfo(): Promise<AppTeamInfo> {
  return validateP(
    AppResponse('teamInfo', AppTeamInfo),
    sendRequestAsync({ getTeamInfo: {} })
  ).then((res) => res.teamInfo)
}

let connectAttempts = 0

// NOTE: The websocket will connect with incorrect player token and steam id,
// you have to request some data to check if the credentials work
export function listen(config: RustPlusConfig) {
  if (socket) socket.disconnect()

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

  socket.on('disconnected', () => {
    const backOffDelay = Math.min(10000, 10 ** connectAttempts)
    log.error(`Rust websocket disconnected, reconnecting in ${backOffDelay}ms`)
    setTimeout(() => {
      listen(config)
    }, backOffDelay)
  })

  socket.connect()

  socketConnectedP = new Promise<void>((resolve) => {
    socket.once('connected', () => {
      connectAttempts = 0
      log.info('Connected to rust server')
      resolve()
    })
  })
}
