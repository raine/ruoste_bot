const Sentry = require('@sentry/node')
Sentry.init({ dsn: process.env.SENTRY_DSN })

import Telegraf, { ContextMessageUpdate } from 'telegraf'
import {
  formatServerListUrl,
  SERVER_SEARCH_PARAMS,
  ListServer,
  getWipedServersCached1m,
  getServerCached1m
} from './lib/just-wiped'
import { Message } from 'telegram-typings'
import {
  formatServerListReply,
  formatServerListReplyWithUpdatedAt,
  formatUpcomingWipeList,
  formatServerConnectReply
} from './lib/message-formatting'
import { DateTime, Interval } from 'luxon'
import log from './lib/logger'
import * as R from 'ramda'
import { getNextWipes } from './lib/get-next-wipes'

type ServerListReply = {
  message: Message
  sent: DateTime
  expires: DateTime
  updated: DateTime | null
  servers: ListServer[]
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
  log.error(err, 'something went wrong')
})

const replyWithServers = (ctx: ContextMessageUpdate) =>
  getWipedServersCached1m(SERVER_SEARCH_PARAMS)
    .then((servers) =>
      ctx
        .replyWithHTML(
          formatServerListReply(
            servers,
            formatServerListUrl(SERVER_SEARCH_PARAMS)
          ),
          EXTRA_OPTS
        )
        .then((msg) => {
          updatedServerListReplies = updatedServerListReplies
            .filter(({ message }) => message.chat.id !== msg.chat.id)
            .concat({
              message: msg,
              sent: DateTime.local(),
              expires: DateTime.local().plus({
                seconds: REPLY_UPDATE_EXPIRES_AFTER_SECS
              }),
              updated: null,
              servers
            })
        })
    )
    .catch((err) => {
      Sentry.captureException(err)
      log.error(err, 'failed to reply with servers')
      ctx.reply('something went wrong 😳')
    })

const updateRepliedServerList = async (msg: Message): Promise<ListServer[]> => {
  const servers = await getWipedServersCached1m(SERVER_SEARCH_PARAMS)
  await bot.telegram.editMessageText(
    msg.chat.id,
    msg.message_id,
    undefined,
    formatServerListReplyWithUpdatedAt(
      servers,
      formatServerListUrl(SERVER_SEARCH_PARAMS)
    ),
    { ...EXTRA_OPTS, parse_mode: 'HTML' }
  )
  return servers
}

const replyWithNextWipes = async (ctx: ContextMessageUpdate) => {
  const msg = await ctx.reply('Loading...')
  const updateMessage = (html: string) =>
    bot.telegram.editMessageText(msg.chat.id, msg.message_id, undefined, html, {
      ...EXTRA_OPTS,
      parse_mode: 'HTML'
    })

  getNextWipes()
    .skip(1)
    .throttle(1000)
    .onValue(({ serverCount, fetchedCount, servers }) => {
      updateMessage(formatUpcomingWipeList(serverCount, fetchedCount, servers))
    })
}

bot.command('wipes', replyWithServers)

bot.command(
  R.range(1, 11).map((n) => '/' + n),
  async (ctx: ContextMessageUpdate) => {
    const text = ctx.update.message!.text!
    const num = parseInt(text.match(/^\/(\d+)/)![1])
    const chatId = ctx.update.message!.chat.id
    const reply = updatedServerListReplies.find(
      ({ message }) => message.chat.id === chatId
    )
    if (reply) {
      const server = reply.servers[num - 1]
      if (server) {
        const fullServer = await getServerCached1m(server.id)
        return ctx.replyWithHTML(
          formatServerConnectReply(fullServer),
          EXTRA_OPTS
        )
      }
    }
  }
)

bot.command('nextwipes', replyWithNextWipes)

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
      repliesToBeUpdated.map((reply) =>
        updateRepliedServerList(reply.message).then((servers) => {
          reply.servers = servers
        })
      )
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
