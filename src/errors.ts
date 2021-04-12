import * as Sentry from '@sentry/node'
import log from './logger'

export function logAndCapture(err: Error, message?: string) {
  Sentry.captureException(err)
  log.error(err, message)
}
