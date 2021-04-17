import delay from 'delay'
import * as t from 'io-ts'
import { DateTime } from 'luxon'
import { updateMapEvent } from '.'
import { getConfig } from '..'
import db, { pgp } from '../../db'
import { DiscordAPI } from '../../discord'
import { formatMapEvent } from '../../discord/formatting'
import log from '../../logger'
import { validateP } from '../../validate'
import {
  BradleyApcDestroyedMapEvent,
  DbMapEvent,
  LargeOilRigCrateHackedMapEvent,
  PatrolHeliDownMapEvent
} from '../types'

let timeoutId: NodeJS.Timeout | undefined

type MapEventTypeWithTimer = (
  | LargeOilRigCrateHackedMapEvent
  | PatrolHeliDownMapEvent
  | BradleyApcDestroyedMapEvent
)['type']

const MAP_EVENTS_WITH_TIMER: {
  type: MapEventTypeWithTimer
  timer: string
}[] = [
  { type: 'LARGE_OIL_RIG_CRATE_HACKED', timer: '15 min' },
  { type: 'PATROL_HELI_DOWN', timer: '5 min' },
  { type: 'BRADLEY_APC_DESTROYED', timer: '5 min' }
]

function formatMapEventMessageToBeUpdatedQuery(
  type: MapEventTypeWithTimer,
  timer: string,
  wipeId: number
): string {
  return pgp.as.format(
    `select *
       from map_events
      where wipe_id = $[wipeId]
        and type = $[type]
        and discord_message_id is not null
        and ((now() <= created_at + $[timer]::interval) or
             (discord_message_last_updated_at is not null and
               discord_message_last_updated_at < (created_at + ($[timer]::interval + '1 sec'::interval))))`,
    { wipeId, timer, type }
  )
}

export async function getMapEventMessagesToBeUpdated(
  wipeId: number
): Promise<DbMapEvent[]> {
  return validateP(
    t.array(DbMapEvent),
    db.any(
      MAP_EVENTS_WITH_TIMER.map(
        ({ type, timer }) =>
          '(' + formatMapEventMessageToBeUpdatedQuery(type, timer, wipeId) + ')'
      ).join(' union ')
    )
  )
}

export async function updateMapEventMessages(
  discord: DiscordAPI,
  wipeId: number
) {
  const { discordEventsChannelId } = await getConfig()
  if (!discordEventsChannelId) return
  const mapEvents = await getMapEventMessagesToBeUpdated(wipeId)
  if (mapEvents.length) log.debug({ mapEvents }, 'Got map events for updating')

  await Promise.all(
    mapEvents.map(async (mapEvent) => {
      await discord.sendOrEditMessage(
        discordEventsChannelId,
        formatMapEvent(mapEvent),
        mapEvent.discordMessageId ?? undefined
      )
      await updateMapEvent(mapEvent.mapEventId, {
        discordMessageLastUpdatedAt: DateTime.local().toSQL()
      })
    })
  )
}

export async function updateMapEventDiscordMessagesLoop(
  discord: DiscordAPI,
  wipeId: number,
  loopInterval = 5000
) {
  if (timeoutId) clearInterval(timeoutId)
  log.info('Starting map event discord message update loop')

  return (async function loop(): Promise<void> {
    try {
      await updateMapEventMessages(discord, wipeId)
    } catch (err) {
      log.error(err, 'Error while updating map event messages')
    }
    await delay(loopInterval)
    return loop()
  })()
}
