import * as t from 'io-ts'
import { pipe } from 'fp-ts/lib/pipeable'
import { chain } from 'fp-ts/lib/Either'
import { DateTime } from 'luxon'

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface DateFromUnixTimeC extends t.Type<DateTime, number, unknown> {}

/**
 * @example
 * import { DateFromNumber } from 'io-ts-types/lib/DateFromNumber'
 * import { right } from 'fp-ts/lib/Either'
 *
 * const date = new Date(1973, 10, 30)
 * const input = date.getTime()
 * assert.deepStrictEqual(DateFromNumber.decode(input), right(date))
 *
 * @since 0.5.0
 */
export const DateTimeFromUnixTime: DateFromUnixTimeC = new t.Type<
  DateTime,
  number,
  unknown
>(
  'DateTimeFromUnixTime',
  (u): u is DateTime => u instanceof DateTime,
  (u, c) =>
    pipe(
      t.number.validate(u, c),
      chain((n) => {
        const d = DateTime.fromSeconds(n)
        return d.isValid ? t.success(d) : t.failure(u, c)
      })
    ),
  (a) => a.toSeconds()
)
