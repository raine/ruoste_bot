import * as R from 'ramda'
import { DateTime, Interval } from 'luxon'
import log from './logger'
import { fromFormatUTC, roundDateTimeHour, toISOWithWeekday } from './date'

type IntervalWithDays = {
  interval: Interval
  days: number
}

const uniqByStartOfDay = (dts: DateTime[]): DateTime[] =>
  R.uniqBy((dt: DateTime) => dt.startOf('day').toMillis(), dts)

const expandInterval = (obj: any): any =>
  R.omit(['interval'], {
    ...obj,
    start: obj.interval.start.toISO(),
    end: obj.interval.end.toISO()
  })

const getIntervalDayCounts = R.pipe<
  IntervalWithDays[],
  { [k: string]: number },
  [string, number][],
  { count: number; days: number }[],
  { count: number; days: number }[]
>(
  R.countBy((i) => i.days),
  R.toPairs,
  R.map(([days, count]) => ({
    days: parseInt(days),
    count
  })),
  R.sortWith([R.descend((obj) => obj.count)])
)

type TimeCount = { count: number; time: string }

export type NextWipe = {
  date: DateTime
  accuracy: 'DATE' | 'TIME'
} | null

const getWipeTimeFromDates = (dates: DateTime[]): DateTime | null =>
  R.pipe<
    DateTime[],
    DateTime[],
    { [time: string]: number },
    [string, number][],
    TimeCount[],
    TimeCount[],
    TimeCount[],
    TimeCount,
    DateTime | null
  >(
    R.map(roundDateTimeHour),
    R.countBy((date) => date.toFormat('HH:mm')),
    R.toPairs,
    R.map(([time, count]) => ({ time, count })),
    R.sortWith([R.descend((obj) => obj.count)]),
    R.tap((counts) => {
      log.info(counts, 'sorted time counts')
    }),
    R.head,
    (mostCommonTime) => {
      if (mostCommonTime && mostCommonTime.count >= 2) {
        return fromFormatUTC(mostCommonTime.time, 'HH:mm')
      } else {
        log.info('no regular wipe time stands out')
        return null
      }
    }
  )(dates)

// TODO: If next wipe date is first thursday of month, wipe time cant be
// calculated based on data
const nextWipe = (wipes: DateTime[]): NextWipe => {
  log.info(wipes.map(toISOWithWeekday), 'previous wipes')
  const sortedUniqWipes = uniqByStartOfDay(
    R.sortBy((dt: DateTime) => dt.toMillis(), wipes)
  )
  const intervals = R.pipe<DateTime[], DateTime[][], Interval[]>(
    R.aperture(2),
    R.map(([start, end]) => Interval.fromDateTimes(start, end))
  )(sortedUniqWipes)

  const intervalsWithDays = R.map(
    (interval: Interval) => ({
      interval,
      days: Math.round(interval.length('days'))
    }),
    intervals
  )

  log.info(intervalsWithDays.map(expandInterval), 'wipe intervals with days')

  const intervalDayCounts = getIntervalDayCounts(intervalsWithDays)
  log.info(intervalDayCounts, 'interval day counts')

  const mostCommonInterval = R.head(intervalDayCounts)
  if (!(mostCommonInterval && mostCommonInterval.count >= 2)) {
    log.info('no regular wipe interval stands out')
    return null
  }

  log.info(mostCommonInterval, 'most common wipe interval in days')
  const wipeIntervalInDays = mostCommonInterval.days
  const wipeDates = R.pipe<
    IntervalWithDays[],
    IntervalWithDays[],
    DateTime[][],
    DateTime[],
    DateTime[]
  >(
    R.filter(({ days }: IntervalWithDays) => days === wipeIntervalInDays),
    R.map(({ interval }) => [interval.start, interval.end]),
    R.unnest,
    R.uniq
  )(intervalsWithDays)

  log.info(
    wipeDates.map(toISOWithWeekday),
    `wipe dates that match the ${wipeIntervalInDays} day interval`
  )

  const wipeTime = getWipeTimeFromDates(wipeDates)
  log.info(
    { wipeTime },
    'ascertained wipe time (date is not meaningful in the datetime shown)'
  )

  const lastWipeDateWithinInterval = R.last(
    R.sortBy((dt) => dt.valueOf(), wipeDates)
  )

  // Take last wipe date that matches the determined wipe interval, and keep
  // adding the wipe interval in days until we have a date that is today or future.
  // That is the next wipe date.
  let nextWipeDate = lastWipeDateWithinInterval!.startOf('day')
  const midnight = DateTime.utc().startOf('day')
  while (nextWipeDate.toMillis() < midnight.toMillis()) {
    nextWipeDate = nextWipeDate.plus({ days: wipeIntervalInDays })
  }

  const nextWipeDateTime = wipeTime
    ? nextWipeDate.set({ hour: wipeTime.hour, minute: wipeTime.minute })
    : null

  log.info({
    nextWipeDate: toISOWithWeekday(nextWipeDate),
    nextWipeDateTime: nextWipeDateTime
      ? toISOWithWeekday(nextWipeDateTime)
      : null
  })

  return nextWipeDate
    ? {
        date: nextWipeDateTime || nextWipeDate,
        accuracy: nextWipeDateTime ? 'TIME' : 'DATE'
      }
    : null
}

export default nextWipe
