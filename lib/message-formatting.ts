import { ListServer, FullServer } from './just-wiped'
import { DateTime } from 'luxon'
import { formatShortDate, formatShortDateTime } from './date'
import TimeAgo from 'javascript-time-ago'
import * as R from 'ramda'

TimeAgo.addLocale(require('javascript-time-ago/locale/en'))
const timeAgo = new TimeAgo('en-US')
const formatRelativeDate = (date: DateTime, style: string): string =>
  timeAgo.format(date.toMillis(), style) || '1m'

const bold = (str: string) => `<b>${str}</b>`
const code = (str: string) => `<code>${str}</code>`
const link = (text: string, href: string) => `<a href="${href}">${text}</a>`

const truncate = (n: number, str: string) =>
  str.length > n ? str.slice(0, n) + `…` : str

// prettier-ignore
const formatMaxGroup = (count: number | null) => 
  count === 1 ? 'solo' :
  count === 2 ? 'duo' :
  count === 3 ? 'trio' :
  count && count > 3 ? count : null

const formatServer = (
  {
    name,
    lastWipe,
    playersCurrent,
    playersMax,
    mapSize,
    rating,
    url,
    maxGroup
  }: ListServer,
  idx: number
): string =>
  [
    bold(formatRelativeDate(lastWipe, 'twitter')),
    '|',
    link(truncate(25, name), url),
    bold(
      '[' +
        [
          `${playersCurrent}/${playersMax}`,
          mapSize,
          `${rating}%`,
          formatMaxGroup(maxGroup)
        ]
          .filter(Boolean)
          .join(', ') +
        ']'
    ),
    `/${idx + 1}`
  ].join(' ')

const formatServerList = (servers: ListServer[]) =>
  servers
    .slice(0, 10)
    .map(formatServer)
    .join('\n')

export const formatServerListReply = (
  servers: ListServer[],
  serverListUrl: string
): string =>
  formatServerList(servers) +
  '\n' +
  link('Open full server list', serverListUrl)

export const formatServerListReplyWithUpdatedAt = (
  servers: ListServer[],
  serverListUrl: string
): string =>
  formatServerListReply(servers, serverListUrl) +
  '\n' +
  code(
    `Last updated at ${DateTime.local()
      .setZone('Europe/Helsinki')
      .toFormat('HH:mm:ss')}`
  )

export const formatServerConnectReply = (server: FullServer) =>
  code(`client.connect ${server.address}`)

const formatWipeListServer = ({
  name,
  playersMax,
  mapSize,
  url,
  maxGroup,
  nextWipe
}: FullServer): string =>
  [
    bold(
      nextWipe!.accuracy === 'DATE'
        ? formatShortDate(nextWipe!.date)
        : formatShortDateTime(nextWipe!.date)
    ),
    '|',
    link(truncate(25, name), url),
    bold(
      '[' +
        [playersMax, mapSize, formatMaxGroup(maxGroup)]
          .filter(Boolean)
          .join(', ') +
        ']'
    )
  ].join(' ')

export const formatUpcomingWipeList = (servers: FullServer[]): string => {
  const sortedByNextWipe = R.sortWith(
    [R.ascend(({ nextWipe }) => (nextWipe ? nextWipe.date : 0))],
    servers
  )

  return sortedByNextWipe.map(formatWipeListServer).join('\n')
}
