import * as t from 'io-ts'
import { NumberFromString } from 'io-ts-types/lib/NumberFromString'
import { JsonFromString } from 'io-ts-types/lib/JsonFromString'

const Server = t.type({
  ip: t.string,
  port: t.string.pipe(NumberFromString)
})

export const BaseNotificationData = t.type({
  title: t.string,
  message: t.string
})

export const TeamNotificationData = t.intersection([
  BaseNotificationData,
  t.type({
    channelId: t.literal('team'),
    body: t.string.pipe(JsonFromString).pipe(Server)
  })
])

export const SmartAlarmNotificationData = t.intersection([
  BaseNotificationData,
  t.type({
    channelId: t.literal('alarm'),
    body: t.string.pipe(JsonFromString).pipe(Server)
  })
])

export const EntityPairingData = t.type({
  channelId: t.literal('pairing'),
  body: t.string.pipe(JsonFromString).pipe(
    t.intersection([
      Server,
      t.type({
        entityId: t.string,
        entityName: t.string,
        entityType: t.string,
        type: t.literal('entity')
      })
    ])
  )
})

export const ServerPairingData = t.type({
  channelId: t.literal('pairing'),
  body: t.string.pipe(JsonFromString).pipe(
    t.intersection([
      Server,
      t.strict({
        name: t.string,
        type: t.literal('server'),
        playerId: t.string,
        playerToken: t.string.pipe(NumberFromString)
      })
    ])
  )
})

export const PairingNotificationData = t.intersection([
  BaseNotificationData,
  t.union([EntityPairingData, ServerPairingData])
])

export const NotificationData = t.union([
  SmartAlarmNotificationData,
  TeamNotificationData,
  PairingNotificationData
])

// prettier-ignore
export type SmartAlarmNotificationData = t.TypeOf<typeof SmartAlarmNotificationData>
export type TeamNotificationData = t.TypeOf<typeof TeamNotificationData>
export type PairingNotificationData = t.TypeOf<typeof PairingNotificationData>

export const FcmNotification = t.type({
  notification: t.type({ data: NotificationData }),
  persistentId: t.string
})

export type FcmNotification = t.TypeOf<typeof FcmNotification>

export const RustPlusConfig = t.strict({
  fcmCredentials: t.union([t.unknown, t.null]),
  discordAlertsChannelId: t.union([t.string, t.null]),
  discordEventsChannelId: t.union([t.string, t.null]),
  serverHost: t.union([t.string, t.null]),
  serverPort: t.union([t.number, t.null]),
  playerSteamId: t.union([t.string, t.null]),
  playerToken: t.union([t.number, t.null])
})

export type RustPlusConfig = t.TypeOf<typeof RustPlusConfig>

export const RustPlusConfigField = t.keyof(RustPlusConfig.type.props)
export type RustPlusConfigField = t.TypeOf<typeof RustPlusConfigField>

export type MapEventK<Type, Data = undefined> = { type: Type; data: Data }

export type CargoShipEnteredMapEvent = MapEventK<
  'CARGO_SHIP_ENTERED',
  {
    previousSpawn: string | null
    dayLengthMinutes: number
  }
>

export type CargoShipLeftMapEvent = MapEventK<'CARGO_SHIP_LEFT'>
export type MapEvent = CargoShipEnteredMapEvent | CargoShipLeftMapEvent

export type ServerConfig = Pick<RustPlusConfig, 'serverHost' | 'serverPort'>
export type DbMapEvent = { createdAt?: string } & MapEvent & ServerConfig

// 'PATROL_HELI_DOWN'
// 'BRADLEY_APC_DESTROYED'
// 'LARGE_OIL_RIG_CRATE_SPAWNED'
// 'LARGE_OIL_RIG_CRATE_TAKEN'
// 'SMALL_OIL_RIG_CRATE_SPAWNED'
// 'SMALL_OIL_RIG_CRATE_TAKEN'

export interface RustPlusEvents {
  alarm: (data: SmartAlarmNotificationData) => void
  pairing: (data: PairingNotificationData) => void
  team: (data: TeamNotificationData) => void
  mapEvent: (data: MapEvent) => void
  connected: (serverInfo: AppInfo, config: RustPlusConfig) => void
}

export const AppResponse = (propName: string, dataType: any) =>
  t.type({
    seq: t.number,
    [propName]: dataType
  })

export const AppInfo = t.type({
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

export const AppTime = t.type({
  dayLengthMinutes: t.number,
  timeScale: t.number,
  sunrise: t.number,
  sunset: t.number,
  time: t.number
})

export type AppTime = t.TypeOf<typeof AppTime>

export const Member = t.type({
  steamId: t.unknown,
  name: t.string,
  x: t.number,
  y: t.number,
  isOnline: t.boolean,
  spawnTime: t.number,
  isAlive: t.boolean,
  deathTime: t.number
})

export const AppTeamInfo = t.type({
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

export const AppMapMarkers = t.type({
  markers: t.array(AppMarker)
})

export type AppMapMarkers = t.TypeOf<typeof AppMapMarkers>
