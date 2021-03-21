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
})
