import * as t from 'io-ts'
import { NumberFromString } from 'io-ts-types/lib/NumberFromString'
import { JsonFromString } from 'io-ts-types/lib/JsonFromString'

type ChannelId = 'alarm' | 'team' | 'pairing'

const notification = (channelId: ChannelId) =>
  t.intersection([
    BaseNotificationData,
    t.type({
      channelId: t.literal(channelId),
      body: t.any
    })
  ])

export const BaseNotificationData = t.type({
  title: t.string,
  message: t.string
})

export const TeamNotificationData = notification('team')
export const SmartAlarmNotificationData = notification('alarm')

export const EntityPairingData = t.type({
  channelId: t.literal('pairing'),
  body: t.string.pipe(JsonFromString).pipe(
    t.strict({
      entityId: t.string,
      entityName: t.string,
      entityType: t.string,
      type: t.literal('entity')
    })
  )
})

export const ServerPairingData = t.type({
  channelId: t.literal('pairing'),
  body: t.string.pipe(JsonFromString).pipe(
    t.strict({
      ip: t.string,
      port: t.string.pipe(NumberFromString),
      name: t.string,
      type: t.literal('server'),
      playerId: t.string,
      playerToken: t.string.pipe(NumberFromString)
    })
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
  serverHost: t.union([t.string, t.null]),
  serverPort: t.union([t.number, t.null]),
  playerSteamId: t.union([t.string, t.null]),
  playerToken: t.union([t.number, t.null])
})

export type RustPlusConfig = t.TypeOf<typeof RustPlusConfig>

export const RustPlusConfigField = t.keyof({
  fcmCredentials: null,
  discordAlertsChannelId: null,
  serverHost: null,
  serverPort: null,
  playerSteamId: null,
  playerToken: null
})

export type RustPlusConfigField = t.TypeOf<typeof RustPlusConfigField>

export type MapEvent = {
  type: 'CARGO_SHIP_ENTERED' | 'CARGO_SHIP_LEFT'
}

export interface RustPlusEvents {
  alarm: (data: SmartAlarmNotificationData) => void
  pairing: (data: PairingNotificationData) => void
  team: (data: TeamNotificationData) => void
  mapEvent: (data: MapEvent) => void
  connected: () => void
}
