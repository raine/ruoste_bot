require('dotenv').config()
import db, { pgp } from './db'
import { getMonuments } from './rustplus/map'
import { DateTime } from 'luxon'
import { distance, XY } from './math'
import { AppMarker, Monument } from './rustplus'
import { getNewMarkers } from './rustplus/map-events'

const host = '95.216.17.108'
const port = 28082
const wipedAt = DateTime.fromSQL('2021-03-25 15:59:34+02')

const formatXY = ({ x, y }: XY): string =>
  `X: ${Math.round(x).toString().padStart(5)} Y: ${Math.round(y)
    .toString()
    .padStart(5)}`

let lastMapMarkers: AppMarker[] | undefined

function logChinook(c: AppMarker, largeOilrig: Monument) {
  console.log(
    'Chinook',
    `${c.id}`.padStart(8),
    'appeared',
    formatXY(c),
    'Distance from large oilrig:',
    Math.round(distance(c, largeOilrig))
  )
}

async function main() {
  const monuments = await getMonuments({
    host,
    port,
    wipeTime: wipedAt.toSeconds()
  })

  const largeOilrig: Monument = monuments.find(
    ({ token }) => token === 'large_oil_rig'
  )!

  const mapMarkers = await db.any<{ markers: AppMarker[] }>(
    `select markers
       from map_markers
      where server_host = $[host]
        and server_port = $[port]
      order by created_at asc`,
    { host, port }
  )

  let chinooksAfterSpawn: (AppMarker & { distanceToLargeOilrig: number })[] = []

  mapMarkers.forEach(({ markers }) => {
    if (lastMapMarkers) {
      const newMarkers = getNewMarkers(lastMapMarkers, markers)
      if (newMarkers.length) {
        const chinooks = newMarkers
          .filter(({ type }) => type === 'CH47')
          .map((c) => ({
            ...c,
            distanceToLargeOilrig: distance(c, largeOilrig!)
          }))

        chinooksAfterSpawn = [...chinooksAfterSpawn, ...chinooks]
      }
    }

    lastMapMarkers = markers
  })

  chinooksAfterSpawn
    .filter(({ distanceToLargeOilrig }) => distanceToLargeOilrig <= 800)
    .forEach((chinook) => {
      const chinookLifetimeMarkers = mapMarkers
        .filter(({ markers }) => markers.some((m) => m.id === chinook.id))
        .map(({ markers }) => markers.filter((m) => m.id === chinook.id))
        .flat()

      chinookLifetimeMarkers.forEach((c) => logChinook(c, largeOilrig))
      console.log()
    })

  pgp.end()
  console.log('Done')
}

void main()
