import { resetDb } from '../utils'
import db from '../../src/db'
import { DateTime } from 'luxon'
import { TypedEmitter } from 'tiny-typed-emitter'
import { validate } from '../../src/validate'
import { mocked } from 'ts-jest/utils'
import * as t from 'io-ts'
import { AppMarker, RustPlusEvents } from '../../src/rustplus'
import {
  getNewMarkers,
  getRemovedMarkers,
  checkMapEvents,
  insertMapEvents,
  resetLastMapMarkers
} from '../../src/rustplus/map-events'

jest.mock('../../src/rustplus/rustplus-socket', () => ({
  __esModule: true,
  getMapMarkers: jest.fn(),
  getTime: jest.fn().mockResolvedValue({
    dayLengthMinutes: 60,
    timeScale: 1,
    sunrise: 8,
    sunset: 20,
    time: 12
  })
}))

import { getMapMarkers } from '../../src/rustplus/rustplus-socket'
const mockedGetMapMarkers = mocked(getMapMarkers, true)

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
  const server = { serverHost: '127.0.0.1', serverPort: 28083 }
  const baseFields = {
    createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}/),
    ...server
  }

  beforeEach(async () => {
    resetLastMapMarkers()
    await resetDb()
    emitter = new TypedEmitter<RustPlusEvents>()
  })

  describe('cargo ship entered', () => {
    async function spawnCargo() {
      mockedGetMapMarkers
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([CARGO_SHIP])

      await checkMapEvents(server, emitter)
      await checkMapEvents(server, emitter)
    }

    async function getLastMapEvent() {
      return db.one(`select * from map_events order by created_at desc limit 1`)
    }

    test('no previous spawn', async () => {
      await spawnCargo()
      expect(await getLastMapEvent()).toEqual({
        type: 'CARGO_SHIP_ENTERED',
        data: {
          dayLengthMinutes: 60,
          previousSpawn: null
        },
        ...baseFields
      })
    })

    test('previous spawn', async () => {
      const previousSpawnDate = DateTime.local().minus({ minutes: 80 }).toISO()
      insertMapEvents([
        {
          createdAt: previousSpawnDate,
          type: 'CARGO_SHIP_ENTERED',
          data: {
            dayLengthMinutes: 60,
            previousSpawn: null
          },
          ...server
        }
      ])

      await spawnCargo()

      expect(await getLastMapEvent()).toEqual({
        type: 'CARGO_SHIP_ENTERED',
        data: {
          dayLengthMinutes: 60,
          previousSpawn: previousSpawnDate
        },
        ...baseFields
      })
    })

    test.todo('safeguard against spawn very long time ago?')
  })
})
