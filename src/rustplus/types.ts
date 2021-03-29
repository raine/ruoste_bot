import * as t from 'io-ts'
import { NumberFromString } from 'io-ts-types/lib/NumberFromString'
import { JsonFromString } from 'io-ts-types/lib/JsonFromString'
import { DateTimeFromUnixTime } from '../types/DateTimeFromUnixTime'
import { Message } from 'protobufjs'

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

export const ServerPairingNotificationData = t.intersection([
  BaseNotificationData,
  ServerPairingData
])

export type ServerPairingNotificationData = t.TypeOf<
  typeof ServerPairingNotificationData
>

export const isServerPairingNotification = (
  pairing: PairingNotificationData
): pairing is ServerPairingNotificationData => pairing.body.type === 'server'

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
  { previousSpawn: string | null }
>

export type CargoShipLeftMapEvent = MapEventK<'CARGO_SHIP_LEFT'>
export type BradleyApcDestroyedMapEvent = MapEventK<'BRADLEY_APC_DESTROYED'>
export type PatrolHeliDownMapEvent = MapEventK<'PATROL_HELI_DOWN'>

type CrateEventData = {
  monument: MonumentToken | null
  onCargoShip: boolean
}

export type CrateSpawnedEvent = MapEventK<'CRATE_SPAWNED', CrateEventData>
export type CrateGoneEvent = MapEventK<'CRATE_GONE', CrateEventData>
export type CrateEvent = CrateSpawnedEvent | CrateGoneEvent

export type LargeOilRigCrateHacked = MapEventK<'LARGE_OIL_RIG_CRATE_HACKED'>

export type MapEvent =
  | CargoShipEnteredMapEvent
  | CargoShipLeftMapEvent
  | BradleyApcDestroyedMapEvent
  | PatrolHeliDownMapEvent
  | CrateSpawnedEvent
  | CrateGoneEvent
  | LargeOilRigCrateHacked

export type ServerHostPort = { host: string; port: number }
export type ServerConfig = Pick<RustPlusConfig, 'serverHost' | 'serverPort'>
export type DbMapEvent = { createdAt?: string; wipeId: number } & MapEvent

export interface RustPlusEvents {
  alarm: (data: SmartAlarmNotificationData) => void
  pairing: (data: PairingNotificationData) => void
  team: (data: TeamNotificationData) => void
  mapEvent: (data: MapEvent) => void
  connected: (serverInfo: ServerInfo, config: RustPlusConfig) => void
  entityChanged: (data: AppEntityChanged) => void
}

export const AppInfo = t.type({
  name: t.string,
  headerImage: t.string,
  url: t.string,
  map: t.string,
  mapSize: t.number,
  wipeTime: DateTimeFromUnixTime,
  players: t.number,
  maxPlayers: t.number,
  queuedPlayers: t.number,
  seed: t.number,
  salt: t.number
})

export type AppInfo = t.TypeOf<typeof AppInfo>

export const ServerInfo = t.intersection([
  AppInfo,
  t.type({
    host: t.string,
    port: t.number
  })
])

export type ServerInfo = t.TypeOf<typeof ServerInfo>

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

export const MonumentToken = t.keyof({
  military_tunnels_display_name: null,
  supermarket: null,
  power_plant_display_name: null,
  oil_rig_small: null,
  sewer_display_name: null,
  satellite_dish_display_name: null,
  harbor_display_name: null,
  harbor_2_display_name: null,
  fishing_village_display_name: null,
  mining_quarry_sulfur_display_name: null,
  airfield_display_name: null,
  mining_quarry_hqm_display_name: null,
  mining_quarry_stone_display_name: null,
  dome_monument_name: null,
  junkyard_display_name: null,
  train_tunnel_display_name: null,
  mining_outpost_display_name: null,
  train_yard_display_name: null,
  gas_station: null,
  outpost: null,
  large_oil_rig: null,
  bandit_camp: null,
  stables_a: null,
  stables_b: null,
  excavator: null,
  launchsite: null,
  swamp_a: null,
  swamp_b: null,
  swamp_c: null,
  lighthouse_display_name: null,
  water_treatment_plant_display_name: null,
  large_fishing_village_display_name: null
})

export type MonumentToken = t.TypeOf<typeof MonumentToken>

export const Monument = t.type({
  token: MonumentToken,
  x: t.number,
  y: t.number
})

export type Monument = t.TypeOf<typeof Monument>

export const AppMap = t.type({
  width: t.number,
  height: t.number,
  jpgImage: t.string,
  oceanMargin: t.number,
  monuments: t.array(Monument),
  background: t.string
})

export type AppMap = t.TypeOf<typeof AppMap>

export const AppEntityPayload = t.type({
  value: t.boolean,
  capacity: t.number,
  hasProtection: t.boolean,
  protectionExpiry: t.number
})

export const AppEntityInfo = t.type({
  type: t.keyof({
    Switch: null,
    StorageMonitor: null
  }),
  payload: AppEntityPayload
})

export const AppEntityChanged = t.type({
  entityId: t.number,
  payload: AppEntityPayload
})

export const AppTeamChanged = t.type({
  playerId: t.string,
  teamInfo: t.type({
    leaderSteamId: t.string,
    members: t.array(Member)
  })
})

export type AppEntityPayload = t.TypeOf<typeof AppEntityPayload>
export type AppEntityInfo = t.TypeOf<typeof AppEntityInfo>
export type AppEntityChanged = t.TypeOf<typeof AppEntityChanged>

export const AppEntityChangedBroadcast = t.type({
  entityChanged: AppEntityChanged
})

export const AppTeamChangedBroadcast = t.type({
  teamChanged: AppTeamChanged
})

export const AppBroadcast = t.union([
  AppEntityChangedBroadcast,
  AppTeamChangedBroadcast
])

export type AppEntityChangedBroadcast = t.TypeOf<
  typeof AppEntityChangedBroadcast
>
export type AppTeamChangedBroadcast = t.TypeOf<typeof AppTeamChangedBroadcast>
export type AppBroadcast = t.TypeOf<typeof AppBroadcast>

export function isMessageBroadcast(
  message: any
): message is { broadcast: Message<any> } {
  return (
    typeof message === 'object' &&
    message !== null &&
    message.broadcast !== null
  )
}

export function isEntityChangedBroadcast(
  broadcast: AppBroadcast
): broadcast is AppEntityChangedBroadcast {
  return 'entityChanged' in broadcast
}
