import Telegraf, { ContextMessageUpdate } from 'telegraf'
import getWipedServers from './lib/get-wiped-servers'
import { Message } from 'telegram-typings'
import { formatServer } from './lib/message-formatting'

const bot = new Telegraf(process.env.BOT_TOKEN as string)
const replyWithServers = (ctx: ContextMessageUpdate) =>
  getWipedServers().then((servers) =>
    ctx.replyWithHTML(
      servers
        .slice(0, 8)
        .map(formatServer)
        .join('\n'),
      { disable_web_page_preview: true }
    )
  )

bot.command('wipet', replyWithServers)

bot.on('sticker', (ctx) => {
  const { sticker } = ctx.update.message as Message
  if (
    sticker &&
    (sticker.emoji === '🏉' || sticker.emoji === '😱') &&
    sticker.set_name === 'Rust_pack'
  )
    replyWithServers(ctx)
})

bot.launch().then(() => {
  console.log('bot started')
})
