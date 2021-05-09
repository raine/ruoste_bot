import * as Sentry from '@sentry/node'
import * as t from 'io-ts'
import { formatValidationErrors } from 'io-ts-reporters'
import { CustomError } from 'ts-custom-error'
import log from './logger'

export function logAndCapture(err: Error, message?: string) {
  Sentry.captureException(err)
  log.error(err, message)
}

export class UnexpectedError extends CustomError {
  type = 'UnexpectedError' as const
}

export class FormattedValidationError extends CustomError {
  public constructor(public errors: t.Errors) {
    super(formatValidationErrors(errors).join('\n'))
  }
}

export class RustPlusSocketError extends CustomError {
  type = 'RustPlusSocketError' as const
}

export const isError = (err: unknown): err is Error =>
  typeof err === 'object' && err !== null && 'message' in err

export const toUnexpectedError = (err: unknown): UnexpectedError =>
  new UnexpectedError(err instanceof Error ? err.message : 'Unexpected error')
