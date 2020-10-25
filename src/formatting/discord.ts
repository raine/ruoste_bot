import * as Discord from 'discord.js'
import { DateTime } from 'luxon'
import { ListServer } from '../just-wiped'
import TimeAgo from 'javascript-time-ago'
import { formatMaxGroup, formatRelativeDate, lastUpdatedAt } from './general'

TimeAgo.addLocale(require('javascript-time-ago/locale/en'))

const formatServerInfoSection = (
  { playersCurrent, playersMax, mapSize, rating, maxGroup, url }: ListServer,
  noCurrentPlayers = false
): string =>
  [
    noCurrentPlayers ? playersMax : `${playersCurrent}/${playersMax}`,
    mapSize,
    `${rating}%`,
    formatMaxGroup(maxGroup),
    `[link](${url})`
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
  color: 0xce422a,
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
