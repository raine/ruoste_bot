import { DateTime } from 'luxon'
import { configure, initEmptyConfig, ServerInfo } from '..'
import { DiscordAPI } from '../../discord'
import { resetDb } from '../../test/utils'
import { createWipeIfNotExist, upsertServer, Wipe } from '../server'
import { insertMapEvent } from './index'
import {
  getMapEventMessagesToBeUpdated,
  updateMapEventMessages
} from './update-discord-messages'

const SERVER = {
  host: '127.0.0.1',
  port: 28083,
  playerSteamId: '123',
  playerToken: 1
}

const SERVER_INFO: ServerInfo = {
  name: '',
  headerImage: '',
  url: 'https://www.google.com',
  map: 'Procedural Map',
  mapSize: 3650,
  wipeTime: DateTime.fromSeconds(1616237757),
  players: 225,
  maxPlayers: 250,
  queuedPlayers: 0,
  seed: 1628075253,
  salt: 1035734960,
  host: '127.0.0.1',
  port: 28083
}

let discord: jest.Mocked<DiscordAPI>
let wipe: Wipe

beforeEach(async () => {
  await resetDb()
  await initEmptyConfig()
  await upsertServer(SERVER)
  wipe = await createWipeIfNotExist(SERVER_INFO)
  discord = ({
    sendOrEditMessage: jest.fn()
  } as unknown) as jest.Mocked<DiscordAPI>
})

describe('getMapEventMessagesToBeUpdated()', () => {
  describe('large oil rig hacked', () => {
    const props = {
      discordMessageId: 'foo',
      wipeId: 1,
      data: null,
      type: 'LARGE_OIL_RIG_CRATE_HACKED' as const
    }

    test('event created a minute ago is selected', async () => {
      const mapEvent = await insertMapEvent({
        ...props,
        createdAt: DateTime.local().minus({ minutes: 1 }).toSQL(),
        discordMessageLastUpdatedAt: null
      })

      const mapEvents = await getMapEventMessagesToBeUpdated(
        'LARGE_OIL_RIG_CRATE_HACKED',
        wipe.wipeId
      )
      expect(mapEvents).toEqual([mapEvent])
    })

    test('event created 16 minutes ago is not selected', async () => {
      await insertMapEvent({
        ...props,
        createdAt: DateTime.local().minus({ minutes: 16 }).toSQL(),
        discordMessageLastUpdatedAt: null
      })

      const mapEvents = await getMapEventMessagesToBeUpdated(
        'LARGE_OIL_RIG_CRATE_HACKED',
        wipe.wipeId
      )
      expect(mapEvents).toEqual([])
    })

    // the point is that event message should be updated once more after 15
    // minute timer has expired, removing timer from the message
    test('selected if not updated once after timer has expired', async () => {
      const mapEvent = await insertMapEvent({
        ...props,
        createdAt: DateTime.local().minus({ minutes: 15 }).toSQL(),
        discordMessageLastUpdatedAt: DateTime.local().toSQL()
      })

      const mapEvents = await getMapEventMessagesToBeUpdated(
        'LARGE_OIL_RIG_CRATE_HACKED',
        wipe.wipeId
      )
      expect(mapEvents).toEqual([mapEvent])
    })

    test('not selected if message updated after timer has expired', async () => {
      await insertMapEvent({
        ...props,
        createdAt: DateTime.local().minus({ minutes: 16 }).toSQL(),
        discordMessageLastUpdatedAt: DateTime.local()
          .minus({ seconds: 59 })
          .toSQL()
      })

      const mapEvents = await getMapEventMessagesToBeUpdated(
        'LARGE_OIL_RIG_CRATE_HACKED',
        wipe.wipeId
      )
      expect(mapEvents).toEqual([])
    })
  })
})

describe('updateMapEventMessages()', () => {
  beforeEach(async () => {
    await configure({ discordEventsChannelId: '123' })
  })

  describe('large oil rig hacked', () => {
    const props = {
      discordMessageId: 'foo',
      wipeId: 1,
      data: null,
      type: 'LARGE_OIL_RIG_CRATE_HACKED' as const
    }

    test('event created a minute ago has a timer', async () => {
      await insertMapEvent({
        ...props,
        createdAt: DateTime.local().minus({ minutes: 1 }).toSQL(),
        discordMessageLastUpdatedAt: null
      })

      await updateMapEventMessages(discord, 1)
      expect(discord.sendOrEditMessage).toHaveBeenCalledWith(
        '123',
        '💻 Large Oil Rig Crate hacked (13:59)',
        'foo'
      )
    })
  })
})
