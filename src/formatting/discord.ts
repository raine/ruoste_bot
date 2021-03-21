import * as Discord from 'discord.js'
import { DateTime, Interval } from 'luxon'
import * as R from 'ramda'
import { FullServer, ListServer } from '../just-wiped'
import {
  filterServerNoise,
  formatMaxGroup,
  formatPlayerCount,
  lastUpdatedAt
} from './general'
import {
  formatShortDateWithWeekday,
  formatTime,
  formatTimeAgo,
  formatRelativeDate
} from '../date'
import * as rustplus from '../rustplus'
import { monumentNameFromToken } from '../rustplus/map'

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

export const formatSmartAlarmAlert = (
  alert: rustplus.SmartAlarmNotificationData
) => {
  const title = Discord.Util.escapeMarkdown(alert.title)
  const message = Discord.Util.escapeMarkdown(alert.message)
  return `🚨 **${title}** — ${message}`
}

export const formatMapEvent = (event: rustplus.MapEvent) => {
  switch (event.type) {
    case 'CARGO_SHIP_ENTERED': {
      const more = event.data.previousSpawn
        ? (() => {
            const previousSpawnDateTime = DateTime.fromISO(
              event.data.previousSpawn
            )
            const previousSpawnTimeAgo = formatTimeAgo(previousSpawnDateTime)
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
          : `taken ${monumentName ? 'from' : ''}`
      return `📦 Locked Crate ${action} ${monumentName}`.trim()
    }
  }
}
