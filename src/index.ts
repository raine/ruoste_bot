const Sentry = require('@sentry/node')
Sentry.init({ dsn: process.env.SENTRY_DSN })
import log from './logger'
import startTelegramBot from './telegram'
import startDiscordBot from './discord'

try {
  startTelegramBot()
  startDiscordBot()
} catch (err) {
  Sentry.captureException(err)
  log.error(err)
}

process.on('unhandledRejection', (err) => {
  log.error('unhandled rejection', err)
  Sentry.captureException(err)
  process.exit(1)
})
