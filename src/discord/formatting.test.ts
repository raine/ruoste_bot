import { DateTime } from 'luxon'
import { ServerInfo } from '../rustplus'
import {
  formatEntitiesUpkeep,
  formatMapEvent,
  formatSmartAlarmAlert
} from './formatting'

describe('formatMapEvent()', () => {
  test('cargo ship entered', () => {
    expect(
      formatMapEvent({
        type: 'CARGO_SHIP_ENTERED',
        data: {
          previousSpawn: DateTime.local()
            .minus({ minute: 81, second: 5, millisecond: 500 })
            .toISO()
        }
      })
    ).toBe('🚢 Cargo Ship entered the map — previous spawn was 1h 21m ago')
  })

  test('cargo ship left', () => {
    expect(
      formatMapEvent({
        type: 'CARGO_SHIP_LEFT',
        data: undefined
      })
    ).toBe('🚢 Cargo Ship left the map')
  })

  test('bradley apc destroyed', () => {
    expect(
      formatMapEvent({
        type: 'BRADLEY_APC_DESTROYED',
        data: undefined
      })
    ).toBe('💥 Bradley APC destroyed')
  })

  test('patrol heli down', () => {
    expect(
      formatMapEvent({
        type: 'PATROL_HELI_DOWN',
        data: undefined
      })
    ).toBe('💥 Patrol Helicopter taken down')
  })

  describe('crate', () => {
    test('spawned to large oil rig', () => {
      expect(
        formatMapEvent({
          type: 'CRATE_SPAWNED',
          data: { monument: 'large_oil_rig', onCargoShip: false }
        })
      ).toBe('📦 Locked Crate spawned to Large Oil Rig')
    })

    test('spawned to no monument', () => {
      expect(
        formatMapEvent({
          type: 'CRATE_SPAWNED',
          data: { monument: null, onCargoShip: false }
        })
      ).toBe('📦 Locked Crate spawned')
    })

    test('spawned to seemingly wrong monument has token as name', () => {
      expect(
        formatMapEvent({
          type: 'CRATE_SPAWNED',
          data: { monument: 'fishing_village_display_name', onCargoShip: false }
        })
      ).toBe('📦 Locked Crate spawned to fishing_village_display_name')
    })

    test('gone from large oil rig', () => {
      expect(
        formatMapEvent({
          type: 'CRATE_GONE',
          data: { monument: 'large_oil_rig', onCargoShip: false }
        })
      ).toBe('📦 Locked Crate gone from Large Oil Rig')
    })

    test('gone from no monument', () => {
      expect(
        formatMapEvent({
          type: 'CRATE_GONE',
          data: { monument: null, onCargoShip: false }
        })
      ).toBe('📦 Locked Crate gone')
    })
  })
})

describe('formatSmartAlarmAlert()', () => {
  const BASE_ALERT = {
    channelId: 'alarm' as const,
    body: {
      img:
        'https:\\/\\/files.facepunch.com\\/Alistair\\/02\\/05\\/0T35W1\\/server-header.png',
      port: 28083,
      ip: '51.77.57.19',
      name: '[RU] Facepunch 4',
      logo:
        'https:\\/\\/files.facepunch.com\\/Alistair\\/02\\/05\\/1Z61F1\\/04_07-48-MagnificentLadybug.png',
      id: 'cdfeccce-7c2f-4d02-8a99-b94a183f3ada',
      url: 'http:\\/\\/www.playrust.com\\/',
      desc:
        "This is an official server owned and operated by Facepunch. \\\\n \\\\n People are free to speak whatever language they like. Don't be surprised if you get banned for being abusive."
    }
  }

  const alert = {
    ...BASE_ALERT,
    title: 'Alarm',
    message: 'Your base is under attack!'
  }

  const soloTeamInfo = {
    leaderSteamId: '0',
    members: [
      {
        steamId: '123',
        name: 'player',
        x: 2181.736083984375,
        y: 454.231689453125,
        isOnline: true,
        spawnTime: 1617450791,
        isAlive: true,
        deathTime: 1616110390
      }
    ]
  }

  test('shows how many are online', () => {
    expect(formatSmartAlarmAlert(alert, soloTeamInfo)).toBe(
      '🚨 **Alarm** — Your base is under attack! (1/1 of group online)'
    )
  })

  test('shows how many are at base', () => {
    expect(
      formatSmartAlarmAlert(alert, soloTeamInfo, { x: 2181, y: 454 })
    ).toBe(
      '🚨 **Alarm** — Your base is under attack! (1/1 of group online, 1 at base)'
    )

    expect(formatSmartAlarmAlert(alert, soloTeamInfo, { x: 2181, y: 1 })).toBe(
      '🚨 **Alarm** — Your base is under attack! (1/1 of group online, 0 at base)'
    )
  })

  test('offline players dont count as being at base', () => {
    const teamInfo = {
      leaderSteamId: '0',
      members: [{ ...soloTeamInfo.members[0], isOnline: false }]
    }

    expect(formatSmartAlarmAlert(alert, teamInfo, { x: 2181, y: 454 })).toBe(
      '🚨 **Alarm** — Your base is under attack! (0/1 of group online, 0 at base)'
    )
  })

  test('removes ! from start of title', () => {
    expect(
      formatSmartAlarmAlert({ ...alert, title: '!Alarm' }, soloTeamInfo)
    ).toBe('🚨 **Alarm** — Your base is under attack! (1/1 of group online)')
  })
})

describe('formatEntitiesUpkeep()', () => {
  const serverInfo: ServerInfo = {
    name: 'best server eu',
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

  const entityInfo = (obj: any) => ({
    type: 'StorageMonitor' as const,
    payload: {
      value: false,
      items: [
        { itemId: -151838493, quantity: 23403, itemIsBlueprint: false },
        { itemId: 317398316, quantity: 14878, itemIsBlueprint: false },
        {
          itemId: -2099697608,
          quantity: 14507,
          itemIsBlueprint: false
        },
        { itemId: 69511070, quantity: 6633, itemIsBlueprint: false }
      ],
      ...obj
    }
  })

  const entity = {
    wipeId: 1,
    entityId: 1,
    entityType: 3 as const,
    discordSwitchMessageId: null,
    handle: 'Kaappi'
  }

  test('description has server name', () => {
    const message = formatEntitiesUpkeep(serverInfo, [
      {
        ...entity,
        entityInfo: entityInfo({
          capacity: 24,
          hasProtection: true,
          protectionExpiry: DateTime.local()
            .plus({ hours: 1, minutes: 29 })
            .toSeconds()
        })
      }
    ])
    expect(message).toEqual({
      embed: expect.objectContaining({
        description: 'best server eu'
      })
    })
  })

  test('expiry in future', () => {
    const message = formatEntitiesUpkeep(serverInfo, [
      {
        ...entity,
        entityInfo: entityInfo({
          capacity: 24,
          hasProtection: true,
          protectionExpiry: DateTime.local()
            .plus({ hours: 1, minutes: 29 })
            .toSeconds()
        })
      }
    ])
    expect(message).toEqual({
      embed: expect.objectContaining({
        fields: [{ inline: true, name: 'Kaappi', value: '1h 29m' }]
      })
    })
  })

  test('decaying', () => {
    const message = formatEntitiesUpkeep(serverInfo, [
      {
        ...entity,
        entityInfo: entityInfo({
          capacity: 24,
          hasProtection: true,
          protectionExpiry: 0
        })
      }
    ])
    expect(message).toEqual({
      embed: expect.objectContaining({
        fields: [{ inline: true, name: 'Kaappi', value: 'Decaying' }]
      })
    })
  })

  test('not connected', () => {
    const message = formatEntitiesUpkeep(serverInfo, [
      {
        ...entity,
        entityInfo: entityInfo({
          hasProtection: false,
          protectionExpiry: 0,
          capacity: 0
        })
      }
    ])

    expect(message).toEqual({
      embed: expect.objectContaining({
        fields: [{ inline: true, name: 'Kaappi', value: 'Not powered' }]
      })
    })
  })

  test('ordered by entity id', () => {
    const message = formatEntitiesUpkeep(serverInfo, [
      {
        wipeId: 1,
        entityId: 2,
        entityType: 3,
        discordSwitchMessageId: null,
        handle: 'foo',
        entityInfo: entityInfo({
          hasProtection: false,
          protectionExpiry: 0,
          capacity: 0
        })
      },
      {
        wipeId: 1,
        entityId: 1,
        entityType: 3,
        discordSwitchMessageId: null,
        handle: 'bar',
        entityInfo: entityInfo({
          hasProtection: false,
          protectionExpiry: 0,
          capacity: 0
        })
      }
    ])
    expect(message).toEqual({
      embed: expect.objectContaining({
        fields: [
          expect.objectContaining({ name: 'bar' }),
          expect.objectContaining({ name: 'foo' })
        ]
      })
    })
  })
})
