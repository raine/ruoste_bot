import * as R from 'ramda'
import * as fs from 'fs'
import {
  parseServerList,
  ListServer,
  parseServerPage,
  getServerAddress,
  getIdFromServerLink,
  parseModdedMultiplier,
  getServer,
  parseMaxGroup
} from './just-wiped'
import { DateTime } from 'luxon'
import { back as nockBack } from 'nock'

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

  test('parses 7 servers', () => {
    expect(servers).toHaveLength(7)
  })

  test('parses server data', () => {
    expect(objDateTimeToISO(servers[0])).toMatchObject({
      id: 1008878,
      country: undefined,
      lastWipe: '2020-11-15T11:36:18.550+02:00',
      inactive: false,
      name: '[EU] RustyKing 3x - Solo Only - Wipe Sundays',
      url: 'https://just-wiped.net/rust_servers/1008878',
      moddedMultiplier: 3,
      mapSize: 3500,
      rating: 69,
      modded: true,
      playersCurrent: 3,
      playersMax: 150,
      map: 'Procedural Map',
      maxGroup: 1
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
      ],
      moddedMultiplier: 2
    })
  })

  test('parses map image url', () => {
    const rawServerPage = fs.readFileSync(
      `${__dirname}/../test/data/server-page-with-map-image.html`,
      'utf8'
    )
    const server = parseServerPage(rawServerPage)
    expect(server.mapImageUrl).toBe(
      '/maps/219212/9c37e072a8d10d91a1b06a0b8f252bc4e4ae3605.jpg'
    )
  })

  test('parses max group from description as fallback', async () => {
    const { nockDone } = await nockBack('suolakaivos.json')
    const server = await getServer(1168733)
    nockDone()
    expect(server.maxGroup).toBe(6)
  })
})

describe('getServerAddress', () => {
  test('works', async () => {
    const { nockDone } = await nockBack('get-server-address.json')
    expect(await getServerAddress(501174)).toBe('213.32.46.191:27222')
    nockDone()
  })
})

describe('getIdFromServerLink', () => {
  test('works', () => {
    expect(
      getIdFromServerLink('https://just-wiped.net/rust_servers/1101218')
    ).toBe(1101218)
  })
})

describe('parseModdedMultiplier', () => {
  test('works', () => {
    expect(
      parseModdedMultiplier(
        'Intoxicated EU Solo/Duo/Trio 2x - 22 Oct - Just wiped'
      )
    ).toBe(2)

    expect(
      parseModdedMultiplier('[EU] RustyKing 3x - Solo Only - Wipe Sundays')
    ).toBe(3)

    expect(
      parseModdedMultiplier('[EU] RustyKing 3X - Solo Only - Wipe Sundays')
    ).toBe(3)
  })
})

describe('parseMaxGroup', () => {
  test('works', () => {
    expect(parseMaxGroup('foo\nTeam limit is 6!foo\nbar')).toBe(6)
    expect(
      parseMaxGroup('alliances! Max team 5 players Vanilla. No scam')
    ).toBe(5)
    expect(parseMaxGroup('✯ Max Team: 8 Players ')).toBe(8)
    expect(parseMaxGroup('Max teamlimit 8, ')).toBe(8)
    expect(parseMaxGroup('Group limit: 5')).toBe(5)
  })
})
