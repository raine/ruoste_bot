const Sentry = require('@sentry/node')
Sentry.init({ dsn: process.env.SENTRY_DSN })

import Telegraf, { ContextMessageUpdate } from 'telegraf'
import { getWipedServers } from './lib/just-wiped'
import { Message } from 'telegram-typings'
import {
  formatServerListReply,
  formatServerListReplyWithUpdatedAt
} from './lib/message-formatting'
import { DateTime, Interval } from 'luxon'
import log from './lib/logger'

type ServerListReply = {
  message: Message
  sent: DateTime
  expires: DateTime
  updated: DateTime | null
}

let updatedServerListReplies: ServerListReply[] = []

const EXTRA_OPTS = {
  disable_web_page_preview: true,
  disable_notification: true
}

const REPLY_UPDATE_INTERVAL_SECS = 180
const REPLY_UPDATE_EXPIRES_AFTER_SECS = 3600

const bot = new Telegraf(process.env.BOT_TOKEN as string)

bot.catch((err: any) => {
  Sentry.captureException(err)
  log.error('something went wrong', err)
})

const replyWithServers = (ctx: ContextMessageUpdate) =>
  getWipedServers()
    .then((servers) =>
      ctx
        .replyWithHTML(formatServerListReply(servers), EXTRA_OPTS)
        .then((msg) => {
          updatedServerListReplies = updatedServerListReplies
            .filter(({ message }) => message.chat.id !== msg.chat.id)
            .concat({
              message: msg,
              sent: DateTime.local(),
              expires: DateTime.local().plus({
                seconds: REPLY_UPDATE_EXPIRES_AFTER_SECS
              }),
              updated: null
            })
        })
    )
    .catch((err) => {
      Sentry.captureException(err)
      log.error('failed to reply with servers', err)
      ctx.reply('something went wrong 😳')
    })

const updateRepliedServerList = async (msg: Message) => {
  const servers = await getWipedServers()
  await bot.telegram.editMessageText(
    msg.chat.id,
    msg.message_id,
    undefined,
    formatServerListReplyWithUpdatedAt(servers),
    { ...EXTRA_OPTS, parse_mode: 'HTML' }
  )
}

bot.command('wipet', replyWithServers)
bot.command('error', (ctx: ContextMessageUpdate) => {
  throw new Error('test')
})

bot.on('sticker', (ctx) => {
  const { sticker } = ctx.update.message as Message
  if (
    sticker &&
    (sticker.emoji === '🏉' || sticker.emoji === '😱') &&
    sticker.set_name === 'Rust_pack'
  )
    replyWithServers(ctx)
})

bot
  .launch()
  .then(() => {
    log.info('bot started')
  })
  .catch((err) => {
    log.error('failed to start bot', err)
    process.exit(1)
  })

async function updateLoop() {
  const now = DateTime.local()
  const repliesToBeUpdated = updatedServerListReplies.filter(
    (reply) =>
      Interval.fromDateTimes(reply.updated || reply.sent, now).length(
        'second'
      ) >= REPLY_UPDATE_INTERVAL_SECS
  )

  if (repliesToBeUpdated.length)
    await Promise.all(
      repliesToBeUpdated.map(({ message }) => updateRepliedServerList(message))
    )
      .then(() => {
        log.info('updated %s messages', repliesToBeUpdated.length)
      })
      .catch((err) => {
        log.error('failed to update messages', err)
      })

  updatedServerListReplies = updatedServerListReplies
    .filter((reply) => reply.expires >= now)
    .map((reply) =>
      repliesToBeUpdated.includes(reply) ? { ...reply, updated: now } : reply
    )

  setTimeout(updateLoop, 1000)
}

updateLoop()

process.on('unhandledRejection', (err) => {
  log.error('unhandled rejection', err)
  Sentry.captureException(err)
  process.exit(1)
})
