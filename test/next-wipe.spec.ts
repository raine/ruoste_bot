import * as d from 'dedent'
import { parseRawWipeDate } from '../lib/just-wiped'
import _nextWipe from '../lib/next-wipe'
import { DateTime } from 'luxon'
import { roundDateTimeHour } from '../lib/date'
import * as R from 'ramda'

const nextWipe = R.pipe(
  _nextWipe,
  R.map((dt: DateTime) => dt.toISO()) as any
)

const toDateTimes = (str: string) =>
  str
    .split('\n')
    .filter((x: string) => x.length)
    .map(parseRawWipeDate)

describe('nextWipe', () => {
  test('1', () => {
    const wipes = toDateTimes(d`
      19.06.2019 - 12:30 UTC
      12.06.2019 - 11:57 UTC
      07.06.2019 - 05:51 UTC
      05.06.2019 - 13:25 UTC
      29.05.2019 - 12:00 UTC`)
    expect(nextWipe(wipes)).toEqual({
      nextWipeDateTime: '2019-07-10T12:00:00.000Z'
    })
  })

  test('2', () => {
    const wipes = toDateTimes(d`
      06.07.2019 - 14:00 UTC
      26.06.2019 - 15:00 UTC
      19.06.2019 - 16:00 UTC
      12.06.2019 - 14:00 UTC
      29.05.2019 - 14:00 UTC`)
    expect(nextWipe(wipes)).toEqual({
      nextWipeDate: '2019-07-10T00:00:00.000Z'
    })
  })

  test('3', () => {
    const wipes = toDateTimes(d`
      06.07.2019 - 14:00 UTC
      29.06.2019 - 13:56 UTC
      22.06.2019 - 14:00 UTC
      15.06.2019 - 13:57 UTC
      08.06.2019 - 15:54 UTC`)
    expect(nextWipe(wipes)).toEqual({
      nextWipeDateTime: '2019-07-13T14:00:00.000Z'
    })
  })

  test('4', () => {
    const wipes = toDateTimes(d`
      06.07.2019 - 14:00 UTC
      29.06.2019 - 14:00 UTC
      22.06.2019 - 14:00 UTC
      15.06.2019 - 14:00 UTC
      08.06.2019 - 14:00 UTC`)
    expect(nextWipe(wipes)).toEqual({
      nextWipeDateTime: '2019-07-13T14:00:00.000Z'
    })
  })

  test('5', () => {
    const wipes = toDateTimes(d`
      06.07.2019 - 10:00 UTC
      04.07.2019 - 20:00 UTC
      29.06.2019 - 09:59 UTC
      22.06.2019 - 10:00 UTC
      15.06.2019 - 17:40 UTC`)
    expect(nextWipe(wipes)).toEqual({
      nextWipeDateTime: '2019-07-13T10:00:00.000Z'
    })
  })
})

describe('roundDateTimeHour', () => {
  const roundDateTimeHourISO = (isoDate) =>
    roundDateTimeHour(DateTime.fromISO(isoDate).setZone('utc')).toISO()

  test('rounds hour forward', () => {
    expect(roundDateTimeHourISO('2019-06-19T12:58:00.000Z')).toBe(
      '2019-06-19T13:00:00.000Z'
    )
  })

  test('rounds hour backwards', () => {
    expect(roundDateTimeHourISO('2019-06-19T12:15:00.000Z')).toBe(
      '2019-06-19T12:00:00.000Z'
    )
  })
})
