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

// getWipedServers().then((servers) => {
//   bot.telegram.sendMessage(
//     -328381794,
//     servers
//       .slice(0, 5)
//       .map(formatServer)
//       .join('\n'),
//     {
//       parse_mode: 'HTML',
//       disable_web_page_preview: true
//     }
//   )
// })
