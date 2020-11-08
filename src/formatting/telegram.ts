import { ListServer, FullServer } from '../just-wiped'
import { formatShortDate, formatShortDateTime } from '../date'
import * as R from 'ramda'
import { formatMaxGroup, formatRelativeDate, lastUpdatedAt } from './general'

const LAGGY_SERVERS = (process.env.LAGGY_SERVERS || '').split(',')

const bold = (str: string) => `<b>${str}</b>`
const code = (str: string) => `<code>${str}</code>`
const link = (text: string, href: string) => `<a href="${href}">${text}</a>`

const truncate = (n: number, str: string) =>
  str.length > n ? str.slice(0, n) + `…` : str

const unlines = (xs: any[]) => xs.filter(Boolean).join('\n')

const formatServerInfoSection = (
  { playersCurrent, playersMax, mapSize, rating, maxGroup }: ListServer,
  noCurrentPlayers = false
): string =>
  bold(
    '[' +
      [
        noCurrentPlayers ? playersMax : `${playersCurrent}/${playersMax}`,
        mapSize,
        `${rating}%`,
        formatMaxGroup(maxGroup)
      ]
        .filter(Boolean)
        .join(', ') +
      ']'
  )

const formatServer = (server: ListServer, idx: number): string =>
  [
    bold(formatRelativeDate(server.lastWipe, 'twitter')),
    '|',
    link(truncate(25, server.name), server.url),
    formatServerInfoSection(server),
    `/${idx + 1}`
  ].join(' ')

export const formatServerListReply = (
  servers: ListServer[],
  serverListUrl: string
): string =>
  servers.map(formatServer).join('\n') +
  '\n' +
  link('Open full server list', serverListUrl)

export const formatServerListReplyWithUpdatedAt = (
  servers: ListServer[],
  serverListUrl: string
): string =>
  formatServerListReply(servers, serverListUrl) + '\n' + code(lastUpdatedAt())

export const formatServerConnectReply = (server: FullServer, address: string) =>
  [
    link(server.name, server.url) + ' ' + formatServerInfoSection(server),
    code(`client.connect ${address}`),
    LAGGY_SERVERS.includes(address) ? bold('POTENTIALLY LAGGY SERVER!!!') : null
  ]
    .filter(Boolean)
    .join('\n')

const formatWipeListServer = (server: FullServer): string => {
  const { name, url, nextWipe } = server
  return [
    bold(
      nextWipe!.accuracy === 'DATE'
        ? formatShortDate(nextWipe!.date)
        : formatShortDateTime(nextWipe!.date)
    ),
    '|',
    link(truncate(25, name), url),
    formatServerInfoSection(server, true)
  ].join(' ')
}

export const formatUpcomingWipeList = (
  serverCount: number,
  fetchedCount: number,
  servers: FullServer[]
): string => {
  const sortedByNextWipe = R.sortWith(
    [R.ascend(({ nextWipe }) => (nextWipe ? nextWipe.date : 0))],
    servers
  )

  return unlines([
    ...sortedByNextWipe.map(formatWipeListServer),
    fetchedCount < serverCount
      ? `Loading... ${((fetchedCount / serverCount) * 100).toFixed(0)}%`
      : null
  ])
}
