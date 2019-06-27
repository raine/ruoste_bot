import * as got from 'got'
import * as qs from 'querystring'
import * as cheerio from 'cheerio'
import { DateTime } from 'luxon'

export type ListServer = {
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
  maxGroup: number | null
}

export type FullServer = {
  wipes: DateTime[]
}

const JUST_WIPED_BASE_URL = 'https://just-wiped.net'

export const formatServerPageUrl = (id: number) =>
  JUST_WIPED_BASE_URL + `/rust_servers/${id}`

export const formatServerListPageUrl = () =>
  JUST_WIPED_BASE_URL +
  '/rust_servers?' +
  qs.stringify({
    country: 'Any',
    map: 'Procedural Map',
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
    region: 'europe',
    s_type: 'vanilla_only',
    uptime_badge: '1',
    wipe_regularity_badge: '0',
    q: ''
  })

const parseYesNo = (str: string): boolean => str === 'Yes'

// TODO: check parsed item with io-ts?
const parseServerList = (html: string): ListServer[] => {
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
      const maxGroupStr = $('.i-max-group .value', elem)
        .text()
        .trim()
      const maxGroup = maxGroupStr ? parseInt(maxGroupStr) : null
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
        map,
        maxGroup
      } as ListServer
    })
    .get()
}

export const getWipedServers = (): Promise<ListServer[]> => {
  const url = formatServerListPageUrl()
  return got(url)
    .then((res) => res.body)
    .then(parseServerList)
}

export const parseRawWipeDate = (str: string): DateTime =>
  DateTime.fromFormat(str, 'dd.MM.yyyy - HH:mm UTC').setZone('UTC', {
    keepLocalTime: true
  })

const parseServerPage = (html: string): FullServer => {
  const $ = cheerio.load(html)
  const wipes = $('.wipe-history .wipe-date')
    .map((_, elem) =>
      parseRawWipeDate(
        $(elem)
          .text()
          .trim()
      )
    )
    .get()

  return { wipes } as FullServer
}

export const getServer = async (id: number): Promise<FullServer> => {
  const url = formatServerPageUrl(id)
  return got(url)
    .then((res) => res.body)
    .then(parseServerPage)
}
