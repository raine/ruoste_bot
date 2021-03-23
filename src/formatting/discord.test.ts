import { DateTime } from 'luxon'
import { formatMapEvent } from './discord'

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
      ).toBe('📦 Locked Crate disappeared from Large Oil Rig')
    })

    test('gone from no monument', () => {
      expect(
        formatMapEvent({
          type: 'CRATE_GONE',
          data: { monument: null, onCargoShip: false }
        })
      ).toBe('📦 Locked Crate taken')
    })
  })
})
