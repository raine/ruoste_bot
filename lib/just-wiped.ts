import * as got from 'got'
import * as qs from 'querystring'
import * as cheerio from 'cheerio'
import { DateTime } from 'luxon'
import { fromFormatUTC } from './date'
import log from './logger'

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

export type FullServer = ListServer & {
  wipes: DateTime[]
}

const JUST_WIPED_BASE_URL = 'https://just-wiped.net'

export const SERVER_LIST_PAGE_URL =
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

export const formatServerPageUrl = (id: number) =>
  JUST_WIPED_BASE_URL + `/rust_servers/${id}`

const parseYesNo = (str: string): boolean => str === 'Yes'
const getText = (c: Cheerio) => c.text().trim()

const parseServerBoxElement = (elem: any) => {
  const $ = cheerio
  const country = $('.flag', elem).attr('title')
  const name = $('a.name h1', elem).length
    ? getText($('a.name h1', elem))
    : getText($('a.name', elem)).split('\n')[0]
  const mapImgAlt = $('.map a img', elem).attr('alt')
  const mapSizeMatches = mapImgAlt.match(/Size: (\d+)/)
  const mapSize = mapSizeMatches ? parseInt(mapSizeMatches[1]) : null
  const url = JUST_WIPED_BASE_URL + $('.name', elem).attr('href')
  const lastWipe = DateTime.fromISO(
    $('.i-last-wipe time', elem).attr('datetime')
  )
  const rating = parseInt(getText($('.i-rating .value', elem)))
  const modded = parseYesNo(getText($('.i-modded .value', elem)))
  const [playersCurrent, playersMax] = getText($('.i-player .value', elem))
    .split('/')
    .map((str) => parseInt(str))
  const map = getText($('.i-map .value', elem))
  const maxGroupStr = getText($('.i-max-group .value', elem))
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
}

// TODO: check parsed item with io-ts?
export const parseServerList = (html: string): ListServer[] => {
  const $ = cheerio.load(html)
  const $servers = $('.servers .server')
  return $servers.map((_, elem) => parseServerBoxElement(elem)).get()
}

export const getWipedServers = (): Promise<ListServer[]> => {
  log.info({ url: SERVER_LIST_PAGE_URL }, 'getting server list')
  return got(SERVER_LIST_PAGE_URL)
    .then((res) => res.body)
    .then(parseServerList)
}

export const parseRawWipeDate = (str: string): DateTime =>
  fromFormatUTC(str, 'dd.MM.yyyy - HH:mm UTC')

export const parseServerPage = (html: string): FullServer => {
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

  return {
    ...parseServerBoxElement($('.server.server-head')),
    wipes
  } as FullServer
}

export const getServer = async (id: number): Promise<FullServer> => {
  const url = formatServerPageUrl(id)
  log.info({ url }, 'getting server page')
  return got(url)
    .then((res) => res.body)
    .then(parseServerPage)
}
