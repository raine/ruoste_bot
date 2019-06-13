import * as got from 'got'
import * as qs from 'querystring'
import * as cheerio from 'cheerio'
import { DateTime } from 'luxon'

const JUST_WIPED_BASE_URL = 'https://just-wiped.net'

const getWipedServersRawPage = () =>
  got(
    JUST_WIPED_BASE_URL +
      '/rust_servers?' +
      qs.stringify({
        country: 'Any',
        map: 'Any',
        max_active_player: '500',
        max_hours_since_wipe: '73',
        max_max_group: '11',
        max_players_max: '500',
        max_wipe_cycle: '31',
        max_world_size: '6000',
        min_active_player: '0',
        min_hours_since_wipe: '0',
        min_max_group: '1',
        min_players_max: '24',
        min_rating: '60',
        min_wipe_cycle: '0',
        min_world_size: '1000',
        mobile_current_player: '0,500',
        mobile_hours_since_wipe: '0,73',
        mobile_max_group: '1,11',
        mobile_max_players: '24,500',
        mobile_min_rating: '60',
        mobile_wipe_cycle: '0,31',
        mobile_world_size: '1000,6000',
        q: '',
        region: 'europe',
        s_type: 'vanilla_only',
        uptime_badge: '1',
        wipe_regularity_badge: '1'
      })
  ).then((res) => res.body)

export type Server = {
  country: string
  name: string
  url: string
  mapSize: number
  lastWipe: DateTime
  rating: number
  modded: boolean
  playersCurrent: number
  playersMax: number
  map: string
}

const parseYesNo = (str: string): boolean => (str === 'Yes' ? true : false)

const parseServers = (html: string): Server[] => {
  const $ = cheerio.load(html)
  const $servers = $('.servers .server')
  return $servers
    .map((_, elem) => {
      const country = $('.flag', elem).attr('title')
      const name = $('.name', elem)
        .text()
        .split(/\n/)[0]
      const mapImgAlt = $('.map a img', elem).attr('alt')
      const mapSizeMatches = mapImgAlt.match(/Size: (\d+)/)
      const mapSize = mapSizeMatches ? parseInt(mapSizeMatches[1]) : null
      const url = JUST_WIPED_BASE_URL + $('.name', elem).attr('href')
      const lastWipe = DateTime.fromISO(
        $('.i-last-wipe time', elem).attr('datetime')
      )
      const rating = parseInt(
        $('.i-rating .value', elem)
          .text()
          .trim()
      )
      const modded = parseYesNo(
        $('.i-modded .value', elem)
          .text()
          .trim()
      )
      const [playersCurrent, playersMax] = $('.i-player .value', elem)
        .text()
        .trim()
        .split('/')
        .map((str) => parseInt(str))
      const map = $('.i-map .value', elem)
        .text()
        .trim()
      return {
        country,
        name,
        url,
        mapSize,
        lastWipe,
        rating,
        modded,
        playersCurrent,
        playersMax,
        map
      } as Server
    })
    .get()
}

const getWipedServers = () => getWipedServersRawPage().then(parseServers)

export default getWipedServers
