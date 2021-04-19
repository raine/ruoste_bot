import { DateTime } from 'luxon'
import { mocked } from 'ts-jest/utils'
import db from '../db'
import { resetDb } from '../test/utils'
import { configure, initEmptyConfig } from './config'
import { getEntityInfo } from './socket'
import { createWipeIfNotExist, upsertServer } from './server'
import { RustPlusEvents, ServerInfo } from './types'
import { getUpkeepDiscordMessageId, trackUpkeep } from './upkeep'
import { TypedEmitter } from 'tiny-typed-emitter'

jest.mock('./socket', () => ({
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
  const events = new TypedEmitter<RustPlusEvents>()

  beforeEach(async () => {
    await resetDb()
    const server = await upsertServer(SERVER)
    await initEmptyConfig()
    await configure({
      discordUpkeepChannelId: '123',
      currentServerId: server.serverId
    })
    wipeId = (await createWipeIfNotExist(SERVER_INFO)).wipeId
    mockedGetEntityInfo.mockResolvedValue(STORAGE_MONITOR_ENTITY_INFO)
    await db.none(
      `insert into entities (wipe_id, entity_id, entity_type) values ($[wipeId], 1, 3)`,
      { wipeId }
    )
    discord = { sendOrEditMessage: jest.fn() }
  })

  test('sends message to channel if there is a working storage monitor', async () => {
    discord.sendOrEditMessage.mockResolvedValue({ id: 'asdf' })
    await trackUpkeep(SERVER_INFO, discord, wipeId, events)
    expect(discord.sendOrEditMessage).toHaveBeenCalledWith(
      '123',
      expect.objectContaining({ embed: expect.anything() }),
      undefined
    )

    await expect(getUpkeepDiscordMessageId(wipeId)).resolves.toEqual({
      wipeId: 1,
      discordMessageId: 'asdf'
    })
  })

  test('updates an existing message if found', async () => {
    discord.sendOrEditMessage.mockResolvedValue({ id: 'asdf' })
    await db.none(
      `insert into upkeep_discord_messages (wipe_id, discord_message_id) values ($[wipeId], 'asdf')`,
      { wipeId }
    )
    await trackUpkeep(SERVER_INFO, discord, wipeId, events)
    expect(discord.sendOrEditMessage).toHaveBeenCalledWith(
      '123',
      expect.objectContaining({ embed: expect.anything() }),
      'asdf'
    )
  })

  describe('entity not found', () => {
    test('sets not_found_at if storage monitor cant be found', async () => {
      mockedGetEntityInfo.mockClear()
      mockedGetEntityInfo.mockRejectedValue({ error: 'not_found' })
      await trackUpkeep(SERVER_INFO, discord, wipeId, events)
      await expect(db.one(`select * from entities`)).resolves.toEqual({
        handle: null,
        wipeId: 1,
        entityId: 1,
        entityType: 3,
        createdAt: expect.any(String),
        notFoundAt: expect.any(String),
        discordSwitchMessageId: null,
        discordPairingMessageId: null
      })
    })

    test('emits storageMonitorUnresponsive event with entity', async () => {
      mockedGetEntityInfo.mockClear()
      mockedGetEntityInfo.mockRejectedValue({ error: 'not_found' })
      const event = new Promise((resolve) =>
        events.once('storageMonitorNotFound', resolve)
      )
      await trackUpkeep(SERVER_INFO, discord, wipeId, events)
      await expect(event).resolves.toEqual({
        createdAt: expect.any(String),
        discordPairingMessageId: null,
        discordSwitchMessageId: null,
        entityId: 1,
        entityInfo: { error: 'not_found' },
        entityType: 3,
        handle: null,
        notFoundAt: null,
        wipeId: 1
      })
    })
  })
})
