import { DateTime } from 'luxon'
import * as R from 'ramda'

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
    R.pipe(
      dateTimeToISO,
      (x) => (R.type(x) === 'Array' ? R.map(dateTimeToISO, x) : x)
    ),
    obj
  )

export const formatShortDate = (date: DateTime): string => date.toFormat('d.L')
export const formatShortDateTime = (date: DateTime): string => {
  const today = DateTime.local()
  return date.hasSame(today, 'day')
    ? date.toFormat('HH:mm')
    : date.toFormat('d.L. HH:mm')
}
