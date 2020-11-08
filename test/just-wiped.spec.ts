import * as R from 'ramda'
import * as fs from 'fs'
import {
  parseServerList,
  ListServer,
  parseServerPage,
  FullServer,
  getServerAddress,
  getIdFromServerLink
} from '../src/just-wiped'
import { DateTime } from 'luxon'

const dateTimeToISO = (x: any) => (x instanceof DateTime ? x.toISO() : x)
const objDateTimeToISO = (obj: any) =>
  R.map(
    R.pipe(dateTimeToISO, (x) =>
      ['Array', 'Object'].includes(R.type(x)) ? R.map(dateTimeToISO, x) : x
    ),
    obj
  )

describe('parseServerList', () => {
  const rawServerList = fs.readFileSync(
    `${__dirname}/../test/data/server-list.html`,
    'utf8'
  )

  let servers: ListServer[]
  beforeEach(() => {
    servers = parseServerList(rawServerList)
  })

  test('parses 10 servers', () => {
    expect(servers).toHaveLength(10)
  })

  test('parses server data', () => {
    expect(objDateTimeToISO(servers[0])).toMatchObject({
      country: 'CZ',
      lastWipe: '2019-07-07T13:00:13.610+03:00',
      map: 'Procedural Map',
      mapSize: 3400,
      maxGroup: null,
      modded: false,
      name: 'Rustafied.com - EU TRIO (Full Wipe 07.07, 12:00 CET)',
      playersCurrent: 4,
      playersMax: 100,
      rating: 76,
      url: 'https://just-wiped.net/rust_servers/490501',
      id: 490501,
      inactive: false
    })
  })

  test('parses inactive server', () => {
    servers = parseServerList(
      fs.readFileSync(
        `${__dirname}/../test/data/server-list-with-inactive.html`,
        'utf8'
      )
    )

    expect(objDateTimeToISO(servers[1])).toMatchObject({
      inactive: true
    })
  })
})

describe('parseServerPage', () => {
  test('parses server data', () => {
    const rawServerPage = fs.readFileSync(
      `${__dirname}/../test/data/server-page.html`,
      'utf8'
    )
    const server = parseServerPage(rawServerPage)
    expect(objDateTimeToISO(server)).toEqual({
      country: 'FR',
      inactive: false,
      lastWipe: '2020-10-22T18:36:15.300+03:00',
      map: 'Procedural Map',
      mapSize: null,
      maxGroup: 3,
      modded: true,
      name: 'Intoxicated EU Solo/Duo/Trio 2x - 22 Oct - Just wiped',
      playersCurrent: 325,
      playersMax: 350,
      rating: 100,
      url: 'https://just-wiped.net/rust_servers/501174',
      id: 501174,
      nextWipe: {
        accuracy: 'TIME',
        date: '2020-10-29T15:00:00.000Z'
      },
      wipes: [
        '2020-10-22T15:36:00.000Z',
        '2020-10-15T15:34:00.000Z',
        '2020-10-08T15:33:00.000Z',
        '2020-10-01T18:26:00.000Z',
        '2020-10-01T12:22:00.000Z'
      ]
    })
  })

  test('parses map image url', () => {
    const rawServerPage = fs.readFileSync(
      `${__dirname}/../test/data/server-page-with-map-image.html`,
      'utf8'
    )
    const server = parseServerPage(rawServerPage)
    expect(server.mapImageUrl).toBe(
      'https://just-wiped.net/maps/219212/9c37e072a8d10d91a1b06a0b8f252bc4e4ae3605.jpg'
    )
  })
})

describe('getServerAddress', () => {
  test('works', async () => {
    expect(await getServerAddress(501174)).toBe('213.32.46.191:27222')
  })
})

describe('getIdFromServerLink', () => {
  test('works', () => {
    expect(
      getIdFromServerLink('https://just-wiped.net/rust_servers/1101218')
    ).toBe(1101218)
  })
})
