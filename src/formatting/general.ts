import { DateTime } from 'luxon'
import TimeAgo from 'javascript-time-ago'
import { ListServer } from '../just-wiped'

TimeAgo.addLocale(require('javascript-time-ago/locale/en'))
const timeAgo = new TimeAgo('en-US')

export const formatRelativeDate = (date: DateTime, style: string): string =>
  timeAgo.format(date.toMillis(), style) || '1m'

// prettier-ignore
export const formatMaxGroup = (count: number | null) => 
  count === 1 ? '🚶' :
  count === 2 ? '👬' :
  count === 3 ? '👪' :
  count && count > 3 ? count : null

export const lastUpdatedAt = () =>
  `Last updated at ${DateTime.local()
    .setZone('Europe/Helsinki')
    .toFormat('HH:mm:ss')}`

export const formatPlayerCount = (server: {
  playersCurrent: number
  playersMax: number
}): string => server.playersCurrent + '/' + server.playersMax

const IGNORED_SERVERS_PATTERN = ['Train your start']

export const isIgnoredServer = (server: ListServer): boolean =>
  server.inactive ||
  IGNORED_SERVERS_PATTERN.some((str) => server.name.includes(str)) ||
  (DateTime.local().diff(server.lastWipe).as('minutes') >= 60 &&
    server.playersCurrent === 0)

export const filterServerNoise = (servers: ListServer[]): ListServer[] =>
  servers.filter((server) => !isIgnoredServer(server))
