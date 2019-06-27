import { DateTime } from 'luxon'

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
