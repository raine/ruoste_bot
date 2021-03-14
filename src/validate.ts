import { fold } from 'fp-ts/lib/Either'
import { formatValidationErrors } from 'io-ts-reporters'
import { pipe } from 'fp-ts/lib/function'
import * as t from 'io-ts'

export function validate<T>(type: t.Decoder<unknown, T>, val: unknown): T {
  return pipe(
    type.decode(val),
    fold(
      (errors) => {
        throw new Error(formatValidationErrors(errors).join('\n'))
      },
      (val) => val
    )
  )
}

export function validateP<T>(
  type: t.Decoder<unknown, T>,
  p: Promise<T>
): Promise<T> {
  return p.then((res: T) => validate(type, res))
}
