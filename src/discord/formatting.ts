import * as Discord from 'discord.js'
import _ from 'lodash'
import { DateTime, Interval } from 'luxon'
import * as R from 'ramda'
import { findEmojiIdByName } from '.'
import {
  formatDurationShort,
  formatRelativeDate,
  formatShortDateWithWeekday,
  formatTime
} from '../date'
import {
  filterServerNoise,
  formatMaxGroup,
  formatPlayerCount,
  lastUpdatedAt
} from '../formatting'
import { FullServer, ListServer } from '../just-wiped'
import { distance, XY } from '../math'
import * as rustplus from '../rustplus'
import { AppTeamInfo, Member, ServerInfo } from '../rustplus'
import { Entity, EntityWithInfo } from '../rustplus/entity'
import { monumentNameFromToken } from '../rustplus/map'
import {
  isStorageMonitorDecaying,
  isStorageMonitorUnpowered
} from '../rustplus/upkeep'

const RUST_COLOR = 0xce422a
const DESCRIPTION_MAX_LENGTH = 2048

// There is no way to escape [ in text, so replacing [ -> ( etc.
const link = (text: string, href: string): string =>
  `[${text.replace(/\[/g, '(').replace(/\]/g, ')')}](${href})`

const bold = (str: string) => `**${str}**`
const truncate = (n: number, str: string) =>
  str.length > n ? str.slice(0, n) + `…` : str

const formatServerInfoSection = (
  {
    playersCurrent,
    playersMax,
    mapSize,
    rating,
    maxGroup,
    moddedMultiplier
  }: ListServer,
  { showPlayers = true, showMapSize = true, showRating = true } = {}
): string =>
  [
    showPlayers ? formatPlayerCount({ playersCurrent, playersMax }) : null,
    moddedMultiplier ? moddedMultiplier + 'x' : null,
    showMapSize ? mapSize : null,
    showRating ? `${rating}%` : null,
    formatMaxGroup(maxGroup)
  ]
    .filter(Boolean)
    .join(', ')

const formatServerToLine = (server: ListServer /* , idx: number */): string =>
  bold(formatRelativeDate(server.lastWipe, 'twitter')) +
  ' | ' +
  link(truncate(25, server.name), server.url) +
  ` (${formatServerInfoSection(server)})`

export const formatServerListReply = (
  servers: ListServer[],
  serverListUrl: string
): Discord.MessageEmbedOptions => {
  const filteredServers = filterServerNoise(servers)
  const filteredServersCount = servers.length - filteredServers.length
  const prefix = link('Full server list', serverListUrl) + '\n'
  return {
    color: RUST_COLOR,
    description: filteredServers.reduce<string>((acc, server /* , idx */) => {
      const line = formatServerToLine(server)
      const str = acc + '\n' + line
      return str.length <= DESCRIPTION_MAX_LENGTH ? str : acc
    }, prefix),
    ...(filteredServersCount > 0
      ? {
          footer: {
            text: `${filteredServersCount} servers hidden to reduce noise`
          }
        }
      : {})
  }
}

export const formatServerListReplyWithUpdatedAt = (
  servers: ListServer[],
  serverListUrl: string
): Discord.MessageEmbedOptions => {
  const reply = formatServerListReply(servers, serverListUrl)
  return {
    ...reply,
    footer: {
      text:
        (reply.footer?.text ? reply.footer.text + '\n' : '') + lastUpdatedAt()
    }
  }
}

export const formatUpcomingWipe = (server: FullServer) => {
  const infoStr = formatServerInfoSection(server, {
    showMapSize: false,
    showPlayers: false,
    showRating: false
  })

  return (
    (server.nextWipe!.accuracy === 'TIME'
      ? formatTime(server.nextWipe!.date) + ' '
      : '??:?? ') +
    link(truncate(30, server.name), server.url) +
    (infoStr.length ? ` (${infoStr})` : '')
  )
}

const VALUE_MAX_LEN = 1024

// Discord has 1024 character limit for EmbedFieldData value so date may have
// to split into multiple fields
export const formatUpcomingWipeListFields = (serversGroupedByDate: {
  [date: string]: FullServer[]
}): Discord.EmbedFieldData[] =>
  Object.entries(serversGroupedByDate).reduce<Discord.EmbedFieldData[]>(
    (fieldsAcc, [date, servers]) => {
      const values = servers.reduce<string[]>((valuesAcc, server) => {
        const init = valuesAcc.slice(0, -1)
        const last = R.last(valuesAcc) ?? ''
        const wipeLine = formatUpcomingWipe(server)
        const newLast = (last + '\n' + wipeLine).trim()
        if (newLast.length < VALUE_MAX_LEN) return [...init, newLast]
        else return [...init, last, wipeLine]
      }, [])

      return [
        ...fieldsAcc,
        ...values.map((value, idx) => ({
          name: idx === 0 ? date : '…',
          value
        }))
      ]
    },
    []
  )

export const formatUpcomingWipeList = (
  serverCount: number,
  fetchedCount: number,
  servers: FullServer[],
  range?: Interval
): Discord.MessageEmbedOptions => {
  const filteredByDate = servers.filter((server) =>
    range
      ? range.contains(server.nextWipe!.date)
      : server.nextWipe!.date < DateTime.local().plus({ days: 5 })
  )
  const sortedByNextWipe = R.sortWith(
    [R.ascend(({ nextWipe }) => (nextWipe ? nextWipe.date : 0))],
    filteredByDate
  )
  const groupedByDate = R.groupBy(
    (server) => formatShortDateWithWeekday(server.nextWipe!.date),
    sortedByNextWipe
  )
  return {
    description:
      fetchedCount < serverCount
        ? `Loading... ${((fetchedCount / serverCount) * 100).toFixed(0)}%`
        : undefined,
    color: RUST_COLOR,
    fields: formatUpcomingWipeListFields(groupedByDate)
  }
}

export const formatInlineEmbedField = (
  name: string,
  value: string
): Discord.EmbedFieldData => ({
  name,
  value,
  inline: true
})

export const formatServerEmbed = (
  server: FullServer,
  address: string
): Discord.MessageEmbedOptions => ({
  title: server.name,
  url: server.url,
  color: RUST_COLOR,
  thumbnail: {
    url: server.mapImageUrl
  },
  author: {
    name: 'just-wiped.net',
    url: 'https://just-wiped.net',
    icon_url:
      'https://cdn.just-wiped.net/assets/rust_logo-c13bf05a12751df540da72db14a165f28f14f05f44f91d2a4e22a5b54512975b.png'
  },
  fields: [
    formatInlineEmbedField(
      'Wiped',
      formatRelativeDate(server.lastWipe, 'twitter')
    ),
    formatInlineEmbedField('Players', formatPlayerCount(server)),
    formatInlineEmbedField('Rating', server.rating.toString() + '%'),
    formatInlineEmbedField(
      'Map size',
      server.mapSize ? server.mapSize.toString() : 'N/A'
    ),
    formatInlineEmbedField(
      'Max group',
      server.maxGroup ? server.maxGroup.toString() : 'N/A'
    ),
    formatInlineEmbedField('Connect', `client.connect ${address}`)
  ]
})

export const formatServerPairing = (
  pairing: rustplus.ServerPairingNotificationData
): Discord.MessageOptions & { split: false } => ({
  embed: {
    title: 'Request to pair with a server',
    description: pairing.body.name,
    color: RUST_COLOR,
    footer: {
      text: 'Add a reaction to switch to this server'
    }
  },
  split: false
})

function getEntityFileName(entityType: number) {
  switch (entityType) {
    case 1:
      return 'smart_switch.png'
    case 2:
      return 'smart_alarm.png'
    case 3:
      return 'storage_monitor.png'
  }
}

export const formatEntityPairing = (
  pairing: rustplus.EntityPairingNotificationData
): Discord.MessageOptions & { split: false } => {
  const entityIconFile = getEntityFileName(pairing.body.entityType)

  return {
    embed: {
      title: `New pairing: ${pairing.body.entityName}`,
      color: RUST_COLOR,
      description: 'Reply to name this entity',
      footer: {
        text: `ID: ${pairing.body.entityId}`,
        iconURL: `https://ruoste-bot.netlify.app/${entityIconFile}`
      }
    },
    split: false
  }
}

const BASE_DISTANCE_THRESHOLD = 50

export const formatSmartAlarmAlert = (
  alert: rustplus.SmartAlarmNotificationData,
  teamInfo: AppTeamInfo,
  baseLocation?: XY
): string => {
  const title = Discord.Util.escapeMarkdown(alert.title.replace(/^!/, ''))
  const message = Discord.Util.escapeMarkdown(alert.message)
  const groupTotalCount = teamInfo.members.length
  const groupOnlineCount = teamInfo.members.filter((m) => m.isOnline).length
  const howManyAtBaseCount = baseLocation
    ? (() => {
        const isMemberAtBase = (member: Member) =>
          distance(member, baseLocation) < BASE_DISTANCE_THRESHOLD &&
          member.isOnline

        return teamInfo.members.reduce(
          (sum, m) => sum + Number(isMemberAtBase(m)),
          0
        )
      })()
    : undefined
  const extra = [
    `${groupOnlineCount}/${groupTotalCount} of group online`,
    ...(howManyAtBaseCount !== undefined
      ? [`${howManyAtBaseCount} at base`]
      : [])
  ].join(', ')
  return `🚨 ${bold(title)} — ${message} (${extra})`
}

export const formatMapEvent = (event: rustplus.MapEvent) => {
  switch (event.type) {
    case 'CARGO_SHIP_ENTERED': {
      const more = event.data.previousSpawn
        ? (() => {
            const previousSpawnDateTime = DateTime.fromISO(
              event.data.previousSpawn
            )
            const previousSpawnTimeAgo = formatDurationShort(
              +DateTime.local() - +previousSpawnDateTime
            )
            return `previous spawn was ${previousSpawnTimeAgo} ago`
          })()
        : ''
      return `🚢 Cargo Ship entered the map${more ? ` — ${more}` : ''}`
    }
    case 'CARGO_SHIP_LEFT': {
      return '🚢 Cargo Ship left the map'
    }
    case 'BRADLEY_APC_DESTROYED': {
      return '💥 Bradley APC destroyed'
    }
    case 'PATROL_HELI_DOWN': {
      return '💥 Patrol Helicopter taken down'
    }
    case 'CRATE_SPAWNED':
    case 'CRATE_GONE': {
      const monumentName = event.data.monument
        ? monumentNameFromToken(event.data.monument) ?? event.data.monument
        : ''
      const action =
        event.type === 'CRATE_SPAWNED'
          ? `spawned ${monumentName ? 'to' : ''}`
          : `gone ${monumentName ? 'from' : ''}`
      return `📦 Locked Crate ${action} ${monumentName}`.trim()
    }
    case 'LARGE_OIL_RIG_CRATE_HACKED': {
      return '💻 Large Oil Rig Crate hacked'
    }
  }
}

export function formatBotActivityText(
  serverInfo: rustplus.AppInfo,
  teamInfo: rustplus.AppTeamInfo
): string {
  const serverHasQueue = serverInfo.queuedPlayers > 0
  // It's confusing to show 195/200 if the server has queue
  const players = serverHasQueue ? serverInfo.maxPlayers : serverInfo.players
  const teamOnlineCount = teamInfo.members.filter((member) => member.isOnline)
    .length
  const teamOnlineText = `${teamOnlineCount}/${teamInfo.members.length}`
  const queueText = serverHasQueue
    ? ` | Queue: ${serverInfo.queuedPlayers}`
    : ''
  const serverPlayersText = `${players}/${serverInfo.maxPlayers} players ${queueText}`.trim()
  return `${teamOnlineText} (${serverPlayersText})`
}

export function formatEntitiesUpkeep(
  serverInfo: ServerInfo,
  entities: EntityWithInfo[]
): Discord.MessageOptions {
  return {
    embed: {
      title: 'Upkeep',
      description: serverInfo.name,
      color: RUST_COLOR,
      fields: _.orderBy(entities, ['entityId', 'asc']).map((entity) => {
        const { protectionExpiry } = entity.entityInfo.payload

        return {
          name: entity.handle ?? entity.entityId,
          value: isStorageMonitorUnpowered(entity.entityInfo)
            ? 'Not powered'
            : isStorageMonitorDecaying(entity.entityInfo)
            ? 'Decaying'
            : protectionExpiry > 0
            ? formatDurationShort(protectionExpiry * 1000 - Date.now())
            : 'Decaying',
          inline: true
        }
      }),
      footer: {
        text: `Last updated at ${DateTime.local()
          .setLocale('de')
          .setZone('Europe/Helsinki')
          .toFormat('D T')}`
      }
    }
  }
}

const SMART_SWITCH_GREEN = 0x8efd60
const SMART_SWITCH_RED = 0xf77d56

export function formatSwitch(
  client: Discord.Client,
  entity: Entity,
  value: boolean
): Discord.MessageOptions {
  const emojiId = findEmojiIdByName(client, 'smartswitch') ?? ''
  return {
    embed: {
      title: `<:smartswitch:${emojiId}> ${entity.handle ?? entity.entityId}`,
      color: value ? SMART_SWITCH_GREEN : SMART_SWITCH_RED
    }
  }
}
