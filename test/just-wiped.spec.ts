import * as R from 'ramda'
import * as fs from 'fs'
import {
  parseServerList,
  ListServer,
  parseServerPage,
  FullServer
} from '../lib/just-wiped'
import { DateTime } from 'luxon'

const dateTimeToISO = (x: any) => (x instanceof DateTime ? x.toISO() : x)
const objDateTimeToISO = (obj: any) =>
  R.map(
    R.pipe(
      dateTimeToISO,
      (x) =>
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
  const rawServerPage = fs.readFileSync(
    `${__dirname}/../test/data/server-page.html`,
    'utf8'
  )

  let server: FullServer
  beforeEach(() => {
    server = parseServerPage(rawServerPage)
  })

  test('parses server data', () => {
    expect(objDateTimeToISO(server)).toEqual({
      country: 'DE',
      inactive: false,
      lastWipe: '2019-07-07T12:00:00.000+03:00',
      map: 'Procedural Map',
      mapSize: 3500,
      maxGroup: 3,
      modded: false,
      name: 'playuwe.net SOLO/DUO/TRIO 07.07. 11:00 CEST07.7.FULLWIPE NOW',
      playersCurrent: 93,
      playersMax: 250,
      rating: 88,
      url: 'https://just-wiped.net/rust_servers/424678',
      id: 424678,
      nextWipe: {
        accuracy: 'TIME',
        date: '2019-07-14T09:00:00.000Z'
      },
      wipes: [
        '2019-07-07T09:00:00.000Z',
        '2019-06-30T09:00:00.000Z',
        '2019-06-23T09:00:00.000Z',
        '2019-06-16T09:00:00.000Z',
        '2019-06-09T09:00:00.000Z'
      ]
    })
  })
})
