import * as E from 'fp-ts/Either'
import { UnexpectedError } from './errors'

export function getPropSafe(
  prop: string,
  obj: unknown
): E.Either<UnexpectedError, unknown> {
  return typeof obj === 'object' && !!obj && prop in obj
    ? E.right((obj as any)[prop] as unknown)
    : E.left(new UnexpectedError(`Expected ${prop} property in object`))
}
