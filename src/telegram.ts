const Sentry = require('@sentry/node')

import Telegraf from 'telegraf'
import {
  formatServerListUrl,
  SERVER_SEARCH_PARAMS,
  ListServer,
  getWipedServersCached1m,
  getServerCached1m,
  getServerAddressCached1h
} from './just-wiped'
import * as Telegram from 'telegram-typings'
import {
  formatServerListReply,
  formatServerListReplyWithUpdatedAt,
  formatUpcomingWipeList,
  formatServerConnectReply
} from './formatting/telegram'
import log from './logger'
import * as R from 'ramda'
import { getNextWipes } from './get-next-wipes'
import { TelegrafContext } from 'telegraf/typings/context'
import { initUpdateLoop, ServerListReply } from './update-loop'

type TelegramServerListReply = ServerListReply<Telegram.Message>
let updatedServerListReplies: TelegramServerListReply[] = []

const EXTRA_OPTS = {
  disable_web_page_preview: true,
  disable_notification: true
}

const updateServerListMessage = async (
  bot: Telegraf<TelegrafContext>,
  msg: Telegram.Message
): Promise<ListServer[]> => {
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

const replyWithServers = (
  ctx: TelegrafContext,
  updateRepliesList: (
    servers: ListServer[],
    sentMessage: Telegram.Message
  ) => void
) =>
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
        .then((sent) => updateRepliesList(servers, sent))
    )
    .catch((err) => {
      Sentry.captureException(err)
      log.error(err, 'failed to reply with servers')
      ctx.reply('something went wrong 😳')
    })

export default function start() {
  const token = process.env.TELEGRAM_BOT_TOKEN!
  if (!token) {
    log.error('Telegram bot token not set, aborting...')
    return
  }

  const bot = new Telegraf(token)
  bot.catch((err: any) => {
    Sentry.captureException(err)
    log.error(err, 'something went wrong')
  })

  const replyWithNextWipes = async (ctx: TelegrafContext) => {
    const msg = await ctx.reply('Loading...')
    const updateMessage = (html: string) =>
      bot.telegram.editMessageText(
        msg.chat.id,
        msg.message_id,
        undefined,
        html,
        {
          ...EXTRA_OPTS,
          parse_mode: 'HTML'
        }
      )

    getNextWipes()
      .skip(1)
      .throttle(1000)
      .onValue(({ serverCount, fetchedCount, servers }) => {
        updateMessage(
          formatUpcomingWipeList(serverCount, fetchedCount, servers)
        )
      })
  }

  bot.command('wipes', (ctx) => replyWithServers(ctx, updateRepliesList))

  bot.command(
    R.range(1, 11).map((n) => '/' + n),
    async (ctx) => {
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
          const address = await getServerAddressCached1h(server.id)
          return ctx.replyWithHTML(
            formatServerConnectReply(fullServer, address),
            EXTRA_OPTS
          )
        }
      }
    }
  )

  bot.command('nextwipes', replyWithNextWipes)

  bot.on('sticker', (ctx) => {
    const { sticker } = ctx.update.message as Telegram.Message
    if (
      sticker &&
      (sticker.emoji === '🏉' || sticker.emoji === '😱') &&
      sticker.set_name === 'Rust_pack'
    )
      replyWithServers(ctx, updateRepliesList)
  })

  bot
    .launch()
    .then(() => {
      log.info('telegram bot started')
    })
    .catch((err) => {
      log.error('failed to start telegram bot', err)
      process.exit(1)
    })

  const updateRepliesList = initUpdateLoop<Telegram.Message>(
    () => updatedServerListReplies,
    (value) => {
      updatedServerListReplies = value
    },
    (msg) => updateServerListMessage(bot, msg),
    (msg) => msg.chat.id
  )
}
