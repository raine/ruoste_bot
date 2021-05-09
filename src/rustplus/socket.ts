import RustPlus from '@liamcottle/rustplus.js'
import * as E from 'fp-ts/Either'
import { pipe } from 'fp-ts/function'
import * as T from 'fp-ts/Task'
import * as TE from 'fp-ts/TaskEither'
import * as t from 'io-ts'
import protobuf, { Message } from 'protobufjs'
import {
  FormattedValidationError,
  isError,
  logAndCapture,
  RustPlusSocketError,
  toUnexpectedError,
  UnexpectedError
} from '../errors'
import log from '../logger'
import { getPropSafe } from '../object'
import { validate } from '../validate'
import { events } from './'
import { saveMapIfNotExist } from './map'
import { createWipeIfNotExist, Server } from './server'
import {
  AppBroadcast,
  AppEntityInfo,
  AppInfo,
  AppMap,
  AppMapMarkers,
  AppTeamInfo,
  AppTime,
  isMessageBroadcast,
  ServerHostPort
} from './types'

export class RustPlusSocketValidationError extends FormattedValidationError {
  type = 'RustPlusSocketValidationError' as const
}

export let socket: any
export let socketConnectedP: Promise<void>
export let connectedServer: ServerHostPort | undefined

const RUSTPLUS_PROTO_PATH = require.resolve(
  '@liamcottle/rustplus.js/rustplus.proto'
)

function appResponseToObject(
  response: Message<any>
): TE.TaskEither<UnexpectedError, unknown> {
  return pipe(
    TE.tryCatch(() => protobuf.load(RUSTPLUS_PROTO_PATH), toUnexpectedError),
    TE.map((proto) => proto.lookupType('rustplus.AppResponse')),
    TE.map((AppResponse) =>
      AppResponse.toObject(response, {
        longs: String,
        enums: String,
        bytes: String
      })
    )
  )
}

async function parseBroadcast<T>(
  type: t.Decoder<unknown, T>,
  broadcast: Message<any>
): Promise<T> {
  const proto = await protobuf.load(RUSTPLUS_PROTO_PATH)
  const AppBroadcast = proto.lookupType('rustplus.AppBroadcast')
  return validate(
    type,
    AppBroadcast.toObject(broadcast, {
      longs: String,
      enums: String,
      bytes: String
    })
  )
}

export async function sendRequestAsync(...args: any[]): Promise<Message<any>> {
  log.debug(args?.[0], 'Sending rustplus request')
  if (socketConnectedP) await socketConnectedP
  else throw new Error('Rust socket not connected')
  return socket.sendRequestAsync(...args)
}

type RustPlusSocketOp =
  | 'getTeamInfo'
  | 'getMap'
  | 'getMapMarkers'
  | 'getTime'
  | 'getInfo'
  | 'getEntityInfo'
  | 'setEntityValue'

export const sendRequestT = (
  op: RustPlusSocketOp,
  opts: Record<string, unknown> = {}
): TE.TaskEither<RustPlusSocketError | UnexpectedError, Message<any>> =>
  TE.tryCatch(
    () => sendRequestAsync({ [op]: {}, ...opts }),
    (err) =>
      isError(err)
        ? new RustPlusSocketError(err.message)
        : toUnexpectedError(err)
  )

export const makeSocketFn = <T>(
  type: t.Decoder<unknown, T>,
  socketOp: RustPlusSocketOp,
  prop: string
) => (
  opts: Record<string, unknown> = {}
): TE.TaskEither<
  RustPlusSocketError | UnexpectedError | RustPlusSocketValidationError,
  T
> =>
  pipe(
    sendRequestT(socketOp, opts),
    TE.chainW((res) => appResponseToObject(res)),
    T.map(E.chainW((obj) => getPropSafe(prop, obj))),
    T.map(
      E.chainW((obj) =>
        pipe(
          type.decode(obj),
          E.mapLeft((errors) => new RustPlusSocketValidationError(errors))
        )
      )
    )
  )

export const setEntityValueE = (entityId: number, value: boolean) =>
  makeSocketFn(
    t.unknown,
    'setEntityValue',
    'entityInfo'
  )({ setEntityValue: value, entityId })
export const getEntityInfoE = (entityId: number) =>
  makeSocketFn(AppEntityInfo, 'getEntityInfo', 'entityInfo')({ entityId })
export const getTimeE = makeSocketFn(AppTime, 'getTime', 'time')
export const getServerInfoE = makeSocketFn(AppInfo, 'getInfo', 'info')
export const getTeamInfoE = makeSocketFn(AppTeamInfo, 'getTeamInfo', 'teamInfo')
export const getMapE = makeSocketFn(AppMap, 'getMap', 'map')
export const getMapMarkersE = makeSocketFn(
  AppMapMarkers,
  'getMapMarkers',
  'mapMarkers'
)

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
      try {
        const broadcast = await parseBroadcast(AppBroadcast, message.broadcast)
        if ('entityChanged' in broadcast) {
          events.emit('entityChanged', broadcast.entityChanged)
        } else if ('teamChanged' in broadcast) {
          events.emit('teamChanged', broadcast.teamChanged)
        }
      } catch (err) {
        logAndCapture(err)
      }
    }
  })

  socket.connect()

  socketConnectedP = new Promise<void>((resolve) => {
    socket.once('connected', async () => {
      connectedServer = server
      connectAttempts = 0
      resolve() // sendRequestAsync pends on this promise
      try {
        const info = await getServerInfo()
        const { wipeId } = await createWipeIfNotExist(info)
        await saveMapIfNotExist(info, wipeId)
        events.emit('connected', info, server, wipeId)
      } catch (err) {
        log.error(err)
      }
    })
  })

  await socketConnectedP
}
