import * as Discord from 'discord.js'
import { DateTime } from 'luxon'
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
import { formatShortDateWithWeekday, formatTime } from '../date'

const RUST_COLOR = 0xce422a
const DESCRIPTION_MAX_LENGTH = 2048

TimeAgo.addLocale(require('javascript-time-ago/locale/en'))

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
    url,
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
  servers: FullServer[]
): Discord.MessageEmbedOptions => {
  const thisWeeksWipes = servers.filter(
    (server) => server.nextWipe!.date < DateTime.local().endOf('week')
  )
  const sortedByNextWipe = R.sortWith(
    [R.ascend(({ nextWipe }) => (nextWipe ? nextWipe.date : 0))],
    thisWeeksWipes
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
