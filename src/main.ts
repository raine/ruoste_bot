require('dotenv').config()
import * as Sentry from '@sentry/node'
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment:
      process.env.NODE_ENV === 'production' ? 'production' : 'development'
  })
}
import log from './logger'
import startDiscordBot from './discord'
import * as rustplus from './rustplus'
import { pgp } from './db'

async function main() {
  try {
    const discord = startDiscordBot()
    await rustplus.init(discord).catch((err) => {
      log.error(err, 'Failed to initialize rustplus')
    })
  } catch (err) {
    Sentry.captureException(err)
    log.error(err)
  }
}

void main()

process.on('unhandledRejection', (err) => {
  if (err) log.error(err, 'Unhandled rejection')
  Sentry.captureException(err)
  process.exit(1)
})

process.on('SIGTERM', () => {
  log.info('received SIGTERM')
  pgp.end()
  process.exit(0)
})
