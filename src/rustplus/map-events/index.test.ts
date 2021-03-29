import { resetDb } from '../../test/utils'
import db from '../../db'
import { DateTime } from 'luxon'
import { TypedEmitter } from 'tiny-typed-emitter'
import { validate } from '../../validate'
import { mocked } from 'ts-jest/utils'
import * as t from 'io-ts'
import { AppMarker, RustPlusEvents, ServerInfo } from '..'
import {
  getNewMarkers,
  getRemovedMarkers,
  insertMapEvents,
  trackMapEvents
} from '.'
import { saveMapIfNotExist } from '../map'

jest.mock('../rustplus-socket', () => ({
  __esModule: true,
  getMapMarkers: jest.fn(),
  getMap: jest.fn()
}))

import { getMapMarkers, getMap } from '../rustplus-socket'
import { createServerAndWipeIfNotExist } from '../server'
const mockedGetMapMarkers = mocked(getMapMarkers, true)
const mockedGetMap = mocked(getMap, true)

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

const CRATE = {
  id: 137827068,
  type: 'Crate' as const,
  x: -56.0625,
  y: 1617.395263671875,
  steamId: '0',
  rotation: 0,
  radius: 0,
  color1: { x: 0, y: 0, z: 0, w: 0 },
  color2: { x: 0, y: 0, z: 0, w: 0 },
  alpha: 0,
  name: ''
}

const CARGO_SHIP = {
  x: 5879.240234375,
  y: 12.6767578125,
  id: 129479730,
  type: 'CargoShip' as const,
  alpha: 0,
  color1: { w: 0, x: 0, y: 0, z: 0 },
  color2: { w: 0, x: 0, y: 0, z: 0 },
  radius: 0,
  steamId: '0',
  rotation: 69.85646057128906,
  name: ''
}

const MAP: any = {
  width: 2825,
  height: 2825,
  monuments: [
    {
      x: 1208.7484130859375,
      y: 1980.2667236328125,
      token: 'launchsite'
    },
    {
      x: 3992.656005859375,
      y: 295.356689453125,
      token: 'oil_rig_small'
    }
  ]
}

const CH47 = {
  id: 99874183,
  name: '',
  type: 'CH47' as const,
  alpha: 0,
  color1: { w: 0, x: 0, y: 0, z: 0 },
  color2: { w: 0, x: 0, y: 0, z: 0 },
  radius: 0,
  steamId: '0',
  rotation: 123.30290985107422
}

const markers = (xs: any) => validate(t.array(AppMarker), xs)

describe('getNewMarkers()', () => {
  test('returns new markers', () => {
    const markers1 = markers([CRATE])
    const markers2 = markers([CRATE, CARGO_SHIP])
    expect(getNewMarkers(markers1, markers2)).toEqual([CARGO_SHIP])
  })
})

describe('getRemovedMarkers()', () => {
  test('returns removed markers', () => {
    const markers1 = markers([CRATE, CARGO_SHIP])
    const markers2 = markers([CRATE])
    expect(getRemovedMarkers(markers1, markers2)).toEqual([CARGO_SHIP])
  })
})

describe('checkMapEvents()', () => {
  let emitter: TypedEmitter<RustPlusEvents>
  const baseFields = {
    createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}/),
    wipeId: 1
  }

  async function checkMapEventsWithMarkers(
    first: AppMarker[],
    second: AppMarker[],
    serverInfo = SERVER_INFO
  ) {
    mockedGetMapMarkers
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second)
    await trackMapEvents(serverInfo, emitter, 0, 2, 10)
  }

  async function getLastMapEvent() {
    return db.oneOrNone(
      `select * from map_events order by created_at desc limit 1`
    )
  }

  async function setupMap(serverInfo = SERVER_INFO, map = MAP) {
    mockedGetMap.mockResolvedValue(map)
    await createServerAndWipeIfNotExist(serverInfo)
    await saveMapIfNotExist(serverInfo)
  }

  beforeEach(async () => {
    await resetDb()
    emitter = new TypedEmitter<RustPlusEvents>()
  })

  describe('cargo ship entered', () => {
    beforeEach(() => setupMap())

    async function spawnCargo(serverInfo = SERVER_INFO) {
      await checkMapEventsWithMarkers([], [CARGO_SHIP], serverInfo)
    }

    test('no previous spawn', async () => {
      await spawnCargo()
      expect(await getLastMapEvent()).toEqual({
        type: 'CARGO_SHIP_ENTERED',
        data: {
          previousSpawn: null
        },
        ...baseFields
      })
    })

    test('previous spawn', async () => {
      const previousSpawnDate = DateTime.local().minus({ minutes: 80 }).toISO()
      await insertMapEvents(SERVER_INFO, [
        {
          createdAt: previousSpawnDate,
          type: 'CARGO_SHIP_ENTERED',
          data: {
            previousSpawn: null
          }
        }
      ])

      await spawnCargo()

      expect(await getLastMapEvent()).toEqual({
        type: 'CARGO_SHIP_ENTERED',
        data: {
          previousSpawn: previousSpawnDate
        },
        ...baseFields
      })
    })

    test('does not return previous spawn from earlier wipe', async () => {
      const wipeTime = DateTime.local().minus({ minutes: 10 })
      const previousSpawnDate = DateTime.local().minus({ minutes: 80 }).toISO()
      const serverInfo = { ...SERVER_INFO, wipeTime }

      // Setup the map again for this wipe (this test does not need it, but
      // would error because of other event)
      await setupMap(serverInfo)
      await insertMapEvents(serverInfo, [
        {
          createdAt: previousSpawnDate,
          type: 'CARGO_SHIP_ENTERED',
          data: {
            previousSpawn: null
          }
        }
      ])

      // Server wiped 10 minutes ago, last spawn 80 minutes ago
      await spawnCargo(serverInfo)

      expect(await getLastMapEvent()).toEqual({
        type: 'CARGO_SHIP_ENTERED',
        data: {
          previousSpawn: null
        },
        ...baseFields,
        // setupMap with different wipeTime creates a new wipe
        wipeId: 2
      })
    })
  })

  describe('cargo ship left', () => {
    beforeEach(() => setupMap())

    async function removeCargo() {
      return checkMapEventsWithMarkers([CARGO_SHIP], [])
    }

    test('no previous spawn', async () => {
      await removeCargo()
      expect(await getLastMapEvent()).toEqual({
        type: 'CARGO_SHIP_LEFT',
        data: null,
        ...baseFields
      })
    })
  })

  describe('explosion', () => {
    beforeEach(() => setupMap())

    async function explode(explosion: AppMarker) {
      return checkMapEventsWithMarkers([], [explosion])
    }

    test('explosion near launch site', async () => {
      const explosion = {
        id: 17012574,
        x: 1175.514892578125,
        y: 1872.5616455078125,
        name: '',
        type: 'Explosion' as const,
        alpha: 0,
        color1: { w: 0, x: 0, y: 0, z: 0 },
        color2: { w: 0, x: 0, y: 0, z: 0 },
        radius: 0,
        steamId: '0',
        rotation: 0
      }

      await explode(explosion)

      expect(await getLastMapEvent()).toEqual({
        type: 'BRADLEY_APC_DESTROYED',
        data: null,
        ...baseFields
      })
    })

    test('explosion somewhere else', async () => {
      const explosion = {
        id: 17012574,
        x: 900,
        y: 1872.5616455078125,
        name: '',
        type: 'Explosion' as const,
        alpha: 0,
        color1: { w: 0, x: 0, y: 0, z: 0 },
        color2: { w: 0, x: 0, y: 0, z: 0 },
        radius: 0,
        steamId: '0',
        rotation: 0
      }

      await explode(explosion)

      expect(await getLastMapEvent()).toEqual({
        type: 'PATROL_HELI_DOWN',
        data: null,
        ...baseFields
      })
    })
  })

  describe('crate', () => {
    beforeEach(() => setupMap())

    const smallOilrigCrate = { ...CRATE, x: 3996, y: 267 }

    describe('spawn', () => {
      async function spawnCrate(crate: AppMarker) {
        return checkMapEventsWithMarkers([], [crate])
      }

      test('small oil rig', async () => {
        await spawnCrate({ ...CRATE, ...smallOilrigCrate })
        expect(await getLastMapEvent()).toEqual({
          type: 'CRATE_SPAWNED',
          data: { monument: 'oil_rig_small', onCargoShip: false },
          ...baseFields
        })
      })

      test('crate respawn with new id does not an trigger event', async () => {
        await checkMapEventsWithMarkers(
          [{ ...CRATE, ...smallOilrigCrate, id: 1 }],
          [{ ...CRATE, ...smallOilrigCrate, id: 2 }]
        )

        expect(await getLastMapEvent()).toBe(null)
      })

      test('crate on cargo', async () => {
        const cargoShip = {
          ...CARGO_SHIP,
          x: 3174.115234375,
          y: -970.6513671875
        }

        const cargoShipCrate = {
          ...CRATE,
          x: 3172.7568359375,
          y: -989.865234375
        }

        await checkMapEventsWithMarkers(
          [cargoShip],
          [cargoShip, cargoShipCrate]
        )

        expect(await getLastMapEvent()).toEqual({
          type: 'CRATE_SPAWNED',
          data: {
            onCargoShip: true,
            monument: null
          },
          ...baseFields
        })
      })
    })

    describe('gone', () => {
      async function unspawnCrate(crate: AppMarker) {
        await checkMapEventsWithMarkers([crate], [])
      }

      test('small oil rig', async () => {
        await unspawnCrate({ ...CRATE, x: 3996, y: 267 })
        expect(await getLastMapEvent()).toEqual({
          type: 'CRATE_GONE',
          data: { monument: 'oil_rig_small', onCargoShip: false },
          ...baseFields
        })
      })
    })
  })

  describe('large oil rig crate hacked', () => {
    beforeEach(() =>
      setupMap(SERVER_INFO, {
        width: 3000,
        height: 3000,
        monuments: [
          { x: 2986.567138671875, y: 4325.794921875, token: 'large_oil_rig' }
        ]
      })
    )

    test('event created when chinook spawns near large oil rig', async () => {
      const ch47 = { ...CH47, x: 3181, y: 4742 }
      await checkMapEventsWithMarkers([], [ch47])
      expect(await getLastMapEvent()).toEqual({
        type: 'LARGE_OIL_RIG_CRATE_HACKED',
        data: null,
        ...baseFields
      })
    })

    test('event not created when chinook spawns far from large oil rig', async () => {
      const ch47 = { ...CH47, x: 0, y: 0 }
      await checkMapEventsWithMarkers([], [ch47])
      expect(await getLastMapEvent()).toEqual(null)
    })
  })
})
