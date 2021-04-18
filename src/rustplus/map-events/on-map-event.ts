import { DiscordAPI } from '../../discord'
import { formatMapEvent } from '../../discord/formatting'
import log from '../../logger'
import { getConfig } from '../config'
import { DbMapEvent } from '../types'
import { updateMapEvent } from './'

export async function onMapEvent(discord: DiscordAPI, mapEvent: DbMapEvent) {
  log.info(mapEvent, 'Map event')

  const { discordEventsChannelId } = await getConfig()
  if (!discordEventsChannelId) return

  if (
    ((mapEvent.type === 'CRATE_SPAWNED' || mapEvent.type === 'CRATE_GONE') &&
      mapEvent.data.onCargoShip) ||
    (mapEvent.type === 'CRATE_GONE' &&
      !['oil_rig_small', 'large_oil_rig'].includes(
        mapEvent.data.monument ?? ''
      )) ||
    mapEvent.type === 'CARGO_SHIP_LEFT'
  )
    return

  try {
    const msg = await discord.sendMessage(
      discordEventsChannelId,
      formatMapEvent(mapEvent)
    )

    await updateMapEvent(mapEvent.mapEventId, {
      discordMessageId: msg.id
    })
  } catch (err) {
    log.error(err)
  }
}
