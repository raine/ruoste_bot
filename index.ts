import Telegraf from 'telegraf'
import getWipedServers, { Server } from './lib/get-wiped-servers'
import { DateTime } from 'luxon'
const TimeAgo = require('javascript-time-ago')

TimeAgo.addLocale(require('javascript-time-ago/locale/en'))
const timeAgo = new TimeAgo('en-US')
const formatRelativeDate = (date: DateTime, style: string): string =>
  timeAgo.format(date.toMillis(), style)

const bold = (str: string) => `<b>${str}</b>`
const link = (text: string, href: string) => `<a href="${href}">${text}</a>`

const truncate = (n: number, str: string) =>
  str.length > n ? str.slice(0, n) + `…` : str

const formatMaxGroup = (count: number | null) => {
  if (count === 1) return 'solo'
  else if (count === 2) return 'duo'
  else if (count === 3) return 'trio'
  else if (count && count > 3) return count
}

const formatServer = ({
  name,
  lastWipe,
  playersCurrent,
  playersMax,
  mapSize,
  rating,
  url
}: Server): string =>
  [
    bold(formatRelativeDate(lastWipe, 'twitter')),
    '/',
    link(truncate(25, name), url),
    bold(`[${playersCurrent}/${playersMax}, ${mapSize}, ${rating}%]`)
  ].join(' ')

const bot = new Telegraf(process.env.BOT_TOKEN as string)

bot.command('wipet', (ctx) =>
  getWipedServers().then((servers) =>
    ctx.replyWithHTML(
      servers
        .slice(0, 5)
        .map(formatServer)
        .join('\n'),
      { disable_web_page_preview: true }
    )
  )
)

bot.launch().then(() => {
  console.log('bot started')
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
