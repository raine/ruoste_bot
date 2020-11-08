import * as Discord from 'discord.js'
import * as R from 'ramda'
import { DateTime } from 'luxon'
import { FullServer, ListServer } from '../just-wiped'
import TimeAgo from 'javascript-time-ago'
import { formatMaxGroup, formatRelativeDate, lastUpdatedAt } from './general'
import { formatShortDate, formatShortDateTime } from '../date'

const RUST_COLOR = 0xce422a
const DESCRIPTION_MAX_LENGTH = 2048

TimeAgo.addLocale(require('javascript-time-ago/locale/en'))

const link = (text: string, href: string): string => `[${text}](${href})`
const bold = (str: string) => `**${str}**`
const truncate = (n: number, str: string) =>
  str.length > n ? str.slice(0, n) + `…` : str

const formatServerInfoSection = (
  { playersCurrent, playersMax, mapSize, rating, maxGroup, url }: ListServer,
  noCurrentPlayers = false
): string =>
  [
    noCurrentPlayers ? playersMax : `${playersCurrent}/${playersMax}`,
    mapSize,
    `${rating}%`,
    formatMaxGroup(maxGroup),
    link('🔗', url)
  ]
    .filter(Boolean)
    .join(', ')

const formatServerToLine = (server: ListServer, idx: number): string =>
  bold(formatRelativeDate(server.lastWipe, 'twitter')) +
  ' | ' +
  truncate(25, server.name) +
  ` **[${formatServerInfoSection(server)}]**`

export const formatServerListReply = (
  servers: ListServer[],
  serverListUrl: string
): Discord.MessageEmbedOptions => {
  const prefix = link('Full server list', serverListUrl) + '\n'
  return {
    color: RUST_COLOR,
    description: servers.reduce<string>((acc, server, idx) => {
      const line = formatServerToLine(server, idx)
      const str = acc + '\n' + line
      return str.length <= DESCRIPTION_MAX_LENGTH ? str : acc
    }, prefix)
  }
}

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
    value: `${link(name, url)} (${formatServerInfoSection(server, true)})`
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
