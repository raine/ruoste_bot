require('dotenv').config()
const Sentry = require('@sentry/node')
Sentry.init({ dsn: process.env.SENTRY_DSN })
import log from './logger'
import startTelegramBot from './telegram'
import startDiscordBot from './discord'
import * as rustplus from './rustplus'

async function main() {
  try {
    await rustplus.init().catch((err) => {
      log.error(err, 'Failed to initialize rustplus')
    })

    startTelegramBot()
    startDiscordBot()
  } catch (err) {
    Sentry.captureException(err)
    log.error(err)
  }
}

main().catch((err) => {
  log.error(err)
})

process.on('unhandledRejection', (err) => {
  if (err) log.error(err)
  Sentry.captureException(err)
  process.exit(1)
})

process.on('SIGTERM', () => {
  log.info('received SIGTERM')
  process.exit(0)
})
