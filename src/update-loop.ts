import { DateTime, Interval } from 'luxon'
import { ListServer } from './just-wiped'
import log from './logger'

export const REPLY_UPDATE_INTERVAL_SECS = 180
export const REPLY_UPDATE_EXPIRES_AFTER_SECS = 3600

export type ServerListReply<T> = {
  message: T
  sent: DateTime
  expires: DateTime
  updated: DateTime | null
  servers: ListServer[]
}

async function updateLoop<T>(
  get: () => ServerListReply<T>[],
  set: (val: ServerListReply<T>[]) => void,
  updateServerListMessage: (msg: T) => Promise<ListServer[]>
) {
  const now = DateTime.local()
  const repliesToBeUpdated = get().filter(
    (reply) =>
      Interval.fromDateTimes(reply.updated || reply.sent, now).length(
        'second'
      ) >= REPLY_UPDATE_INTERVAL_SECS
  )

  if (repliesToBeUpdated.length)
    await Promise.all(
      repliesToBeUpdated.map((reply) =>
        updateServerListMessage(reply.message).then((servers) => {
          reply.servers = servers
        })
      )
    )
      .then(() => {
        log.info('updated %s messages', repliesToBeUpdated.length)
      })
      .catch((err) => {
        log.error('failed to update messages', err)
      })

  set(
    get()
      .filter((reply) => reply.expires >= now)
      .map((reply) =>
        repliesToBeUpdated.includes(reply) ? { ...reply, updated: now } : reply
      )
  )

  setTimeout(() => {
    updateLoop(get, set, updateServerListMessage)
  }, 1000)
}

export function initUpdateLoop<T>(
  get: () => ServerListReply<T>[],
  set: (val: ServerListReply<T>[]) => void,
  updateServerListMessage: (msg: T) => Promise<ListServer[]>,
  getChannelId: (msg: T) => unknown
) {
  updateLoop(get, set, updateServerListMessage)

  function updateRepliesList(servers: ListServer[], sentMessage: T) {
    set(
      get()
        .filter(
          ({ message }) => getChannelId(message) !== getChannelId(sentMessage)
        )
        .concat({
          message: sentMessage,
          sent: DateTime.local(),
          expires: DateTime.local().plus({
            seconds: REPLY_UPDATE_EXPIRES_AFTER_SECS
          }),
          updated: null,
          servers
        })
    )
  }

  return updateRepliesList
}
