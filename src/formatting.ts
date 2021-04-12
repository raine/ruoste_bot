import { DateTime } from 'luxon'
import { ListServer } from './just-wiped'

// prettier-ignore
export const formatMaxGroup = (count: number | null) => 
  count === 1 ? '🚶' :
  count === 2 ? '👬' :
  count === 3 ? '👪' :
  count && count > 3 ? `${count} max` : null

export const lastUpdatedAt = () =>
  `Last updated at ${DateTime.local()
    .setZone('Europe/Helsinki')
    .toFormat('HH:mm:ss')}`

export const formatPlayerCount = (server: {
  playersCurrent: number
  playersMax: number
}): string => server.playersCurrent + '/' + server.playersMax

const IGNORED_SERVERS_PATTERN = ['Train your start']

export const isIgnoredServer = (server: ListServer): boolean => {
  const minsAgoWiped = DateTime.local().diff(server.lastWipe).as('minutes')
  const { playersCurrent } = server
  return (
    server.inactive ||
    IGNORED_SERVERS_PATTERN.some((str) => server.name.includes(str)) ||
    (minsAgoWiped >= 10 && playersCurrent < 5) ||
    (minsAgoWiped >= 30 && playersCurrent < 10) ||
    (minsAgoWiped >= 60 && playersCurrent < 30)
  )
}

export const filterServerNoise = (servers: ListServer[]): ListServer[] =>
  servers.filter((server) => !isIgnoredServer(server))
