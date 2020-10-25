import * as Discord from 'discord.js'
import * as R from 'ramda'
import { DateTime } from 'luxon'
import { FullServer, ListServer } from '../just-wiped'
import TimeAgo from 'javascript-time-ago'
import { formatMaxGroup, formatRelativeDate, lastUpdatedAt } from './general'
import { formatShortDate, formatShortDateTime } from '../date'

const RUST_COLOR = 0xce422a

TimeAgo.addLocale(require('javascript-time-ago/locale/en'))

const link = (text: string, href: string): string => `[${text}](${href})`

const formatServerInfoSection = (
  { playersCurrent, playersMax, mapSize, rating, maxGroup, url }: ListServer,
  noCurrentPlayers = false,
  noLink = false
): string =>
  [
    noCurrentPlayers ? playersMax : `${playersCurrent}/${playersMax}`,
    mapSize,
    `${rating}%`,
    formatMaxGroup(maxGroup),
    noLink ? undefined : link('link', url)
  ]
    .filter(Boolean)
    .join(', ')

const formatServerToEmbedField = (
  server: ListServer,
  idx: number
): Discord.EmbedFieldData => ({
  name: `${formatRelativeDate(
    //@ts-ignore
    DateTime.fromISO(server.lastWipe),
    'twitter'
  )} | ${server.name}`,
  value: formatServerInfoSection(server)
})

const formatServersToEmbedFields = (
  servers: ListServer[]
): Discord.EmbedFieldData[] =>
  servers.slice(0, 10).map(formatServerToEmbedField)

export const formatServerListReply = (
  servers: ListServer[],
  serverListUrl: string
): Discord.MessageEmbedOptions => ({
  color: RUST_COLOR,
  description: `[Full server list](${serverListUrl})`,
  fields: formatServersToEmbedFields(servers)
})

export const formatServerListReplyWithUpdatedAt = (
  servers: ListServer[],
  serverListUrl: string
): Discord.MessageEmbedOptions => {
  return {
    ...formatServerListReply(servers, serverListUrl),
    footer: {
      text: lastUpdatedAt()
    }
  }
}

const formatWipeListServer = (server: FullServer): Discord.EmbedFieldData => {
  const { name, url, nextWipe } = server
  return {
    name:
      nextWipe!.accuracy === 'DATE'
        ? formatShortDate(nextWipe!.date)
        : formatShortDateTime(nextWipe!.date),
    value: `${link(name, url)} (${formatServerInfoSection(server, true, true)})`
  }
}

export const formatUpcomingWipeList = (
  serverCount: number,
  fetchedCount: number,
  servers: FullServer[]
): Discord.MessageEmbedOptions => {
  const sortedByNextWipe = R.sortWith(
    [R.ascend(({ nextWipe }) => (nextWipe ? nextWipe.date : 0))],
    servers
  )
  return {
    description:
      fetchedCount < serverCount
        ? `Loading... ${((fetchedCount / serverCount) * 100).toFixed(0)}%`
        : undefined,
    color: RUST_COLOR,
    fields: sortedByNextWipe.map(formatWipeListServer)
  }
}
