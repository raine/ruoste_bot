import * as Discord from 'discord.js'
import * as R from 'ramda'
import { FullServer, ListServer } from '../just-wiped'
import TimeAgo from 'javascript-time-ago'
import {
  filterServerNoise,
  formatMaxGroup,
  formatPlayerCount,
  formatRelativeDate,
  lastUpdatedAt
} from './general'
import { formatShortDate, formatShortDateTime } from '../date'

const RUST_COLOR = 0xce422a
const DESCRIPTION_MAX_LENGTH = 2048

TimeAgo.addLocale(require('javascript-time-ago/locale/en'))

const link = (text: string, href: string): string => `[${text}](${href})`
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
    url,
    moddedMultiplier
  }: ListServer,
  noCurrentPlayers = false
): string =>
  [
    noCurrentPlayers
      ? playersMax
      : formatPlayerCount({ playersCurrent, playersMax }),
    moddedMultiplier ? moddedMultiplier + 'x' : null,
    mapSize,
    `${rating}%`,
    formatMaxGroup(maxGroup),
    link('🔗', url)
  ]
    .filter(Boolean)
    .join(', ')

const formatServerToLine = (server: ListServer /* , idx: number */): string =>
  bold(formatRelativeDate(server.lastWipe, 'twitter')) +
  ' | ' +
  truncate(25, server.name) +
  ` **[${formatServerInfoSection(server)}]**`

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
            text: `${filteredServersCount} servers not shown to reduce noise`
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
