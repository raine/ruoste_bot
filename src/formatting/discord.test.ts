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
})
