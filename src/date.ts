import { DateTime } from 'luxon'
import * as R from 'ramda'
import humanizeDuration from 'humanize-duration'
import TimeAgo from 'javascript-time-ago'
TimeAgo.addLocale(require('javascript-time-ago/locale/en'))
const timeAgo = new TimeAgo('en-US')

const HEL_TZ = 'Europe/Helsinki'

// DateTime.fromFormat defaults to local timezone
export const fromFormatUTC = (str: string, format: string) =>
  DateTime.fromFormat(str, format).setZone('UTC', {
    keepLocalTime: true
  })

export const roundDateTimeHour = (date: DateTime) =>
  date.minute > 45
    ? date.startOf('hour').plus({ hour: 1 })
    : date.startOf('hour')

export const toISOWithWeekday = (date: DateTime) =>
  `${date.toISO()} (${date.weekdayShort})`

const dateTimeToISO = (x: any) => (x instanceof DateTime ? x.toISO() : x)
export const objDateTimeToISO = (obj: any) =>
  R.map(
    R.pipe(dateTimeToISO, (x) =>
      R.type(x) === 'Array' ? R.map(dateTimeToISO, x) : x
    ),
    obj
  )

export const formatShortDate = (date: DateTime): string =>
  date.setZone(HEL_TZ).toFormat('d.L.')

export const formatShortDateWithWeekday = (date: DateTime): string =>
  date.setZone(HEL_TZ).toFormat('ccc d.L.')

export const formatShortDateTime = (date: DateTime): string => {
  const today = DateTime.local()
  date = date.setZone(HEL_TZ)
  return date.hasSame(today, 'day')
    ? date.toFormat('HH:mm')
    : date.toFormat('d.L. HH:mm')
}

export const formatTime = (date: DateTime): string => {
  return date.setZone(HEL_TZ).toFormat('HH:mm')
}

export const formatRelativeDate = (date: DateTime, style: string): string =>
  timeAgo.format(date.toMillis(), style) || '1m'

const shortEnglishHumanizer = humanizeDuration.humanizer({
  language: 'shortEn',
  languages: {
    shortEn: {
      y: () => 'y',
      mo: () => 'mo',
      w: () => 'w',
      d: () => 'd',
      h: () => 'h',
      m: () => 'm',
      s: () => 's',
      ms: () => 'ms'
    }
  }
})

export const formatDurationShort = (
  ms: number,
  opts: humanizeDuration.Options = {
    round: true,
    units: ['y', 'mo', 'w', 'd', 'h', 'm'],
    largest: 2,
    spacer: '',
    delimiter: ' '
  }
): string => shortEnglishHumanizer(ms, opts)
