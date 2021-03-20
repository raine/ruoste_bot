import { DateTime } from 'luxon'
import { formatMapEvent } from './discord'

describe('formatMapEvent()', () => {
  test('cargo ship entered', () => {
    expect(
      formatMapEvent({
        type: 'CARGO_SHIP_ENTERED',
        data: {
          previousSpawn: DateTime.local().minus({ minute: 80 }).toISO(),
          dayLengthMinutes: 60
        }
      })
    ).toBe(
      '🚢 Cargo Ship entered the map — previous spawn was 1h 20m ago (1.35 rust days)'
    )
  })
})
