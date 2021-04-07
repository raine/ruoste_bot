import { DateTime } from 'luxon'
import { mocked } from 'ts-jest/utils'
import db from '../db'
import { resetDb } from '../test/utils'
import { configure, initEmptyConfig } from './config'
import { getEntityInfo } from './rustplus-socket'
import { createWipeIfNotExist, upsertServer } from './server'
import { ServerInfo } from './types'
import { getUpkeepDiscordMessageId, trackUpkeep } from './upkeep'

jest.mock('./rustplus-socket', () => ({
  __esModule: true,
  getEntityInfo: jest.fn()
}))

const mockedGetEntityInfo = mocked(getEntityInfo)

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

const STORAGE_MONITOR_ENTITY_INFO = {
  type: 'StorageMonitor' as const,
  payload: {
    value: false,
    items: [
      { itemId: -151838493, quantity: 23403, itemIsBlueprint: false },
      { itemId: 317398316, quantity: 14878, itemIsBlueprint: false },
      { itemId: -2099697608, quantity: 14507, itemIsBlueprint: false },
      { itemId: 69511070, quantity: 6633, itemIsBlueprint: false }
    ],
    capacity: 24,
    hasProtection: true,
    protectionExpiry: 1618421138
  }
}

describe('upkeep tracking', () => {
  let wipeId: number
  let discord: any

  beforeEach(async () => {
    await resetDb()
    await upsertServer(SERVER)
    await initEmptyConfig()
    await configure({ discordGeneralChannelId: '123' })
    wipeId = (await createWipeIfNotExist(SERVER_INFO)).wipeId
    mockedGetEntityInfo.mockResolvedValue(STORAGE_MONITOR_ENTITY_INFO)
    await db.none(
      `insert into entities (wipe_id, entity_id, entity_type) values ($[wipeId], 1, 3)`,
      { wipeId }
    )
    discord = { sendOrEditUpkeepMessage: jest.fn() }
  })

  test('sends message to channel if there is a working storage monitor', async () => {
    discord.sendOrEditUpkeepMessage.mockResolvedValue({ id: 'asdf' })
    await trackUpkeep(SERVER_INFO, discord, wipeId)
    expect(discord.sendOrEditUpkeepMessage).toHaveBeenCalledWith(
      SERVER_INFO,
      expect.any(Array),
      '123',
      undefined
    )

    await expect(getUpkeepDiscordMessageId(wipeId)).resolves.toEqual({
      wipeId: 1,
      discordMessageId: 'asdf'
    })
  })

  test('updates an existing message if found', async () => {
    discord.sendOrEditUpkeepMessage.mockResolvedValue({ id: 'asdf' })
    await db.none(
      `insert into upkeep_discord_messages (wipe_id, discord_message_id) values ($[wipeId], 'asdf')`,
      { wipeId }
    )
    await trackUpkeep(SERVER_INFO, discord, wipeId)
    expect(discord.sendOrEditUpkeepMessage).toHaveBeenCalledWith(
      SERVER_INFO,
      expect.any(Array),
      '123',
      'asdf'
    )
  })
})
