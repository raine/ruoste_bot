import { DateTime } from 'luxon'
import TimeAgo from 'javascript-time-ago'

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
