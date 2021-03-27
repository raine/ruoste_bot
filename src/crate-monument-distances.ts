require('dotenv').config()
import db, { pgp } from './db'
import _ from 'lodash'
import { getMonuments } from './rustplus/map'
import { DateTime } from 'luxon'
import { distance } from './math'

const host = '178.33.128.186'
const port = 28108
const wipeTime = DateTime.fromSQL('2021-03-20 12:55:57+02')

async function main() {
  const monuments = await getMonuments({
    host,
    port,
    wipeTime
  })

  const mapMarkers = await db
    .any<{ id: string; x: string; y: string }>(
      `select distinct marker->>'id' as id, marker->>'x' as x, marker->>'y' as y
         from map_markers
        cross join lateral jsonb_array_elements(markers) marker(marker)      
        where marker->>'type' = 'Crate'
          and server_host = $[host]
          and server_port = $[port]`,
      { host, port }
    )
    .then((rows) =>
      rows.map((row) => ({
        ...row,
        x: parseFloat(row.x),
        y: parseFloat(row.y)
      }))
    )

  const crates = _.uniqBy(mapMarkers, 'id')

  crates.forEach((crate) => {
    const id = crate.id
    const x = Math.round(crate.x)
    const y = Math.round(crate.y)
    const nearestMonument = _.minBy(monuments, (m) => distance(m, crate))

    console.log(
      `ID: ${id}  X: ${x}\tY: ${y}\tNearest monument: ${
        nearestMonument?.token
      }\tDistance: ${distance(nearestMonument!, crate)}`
    )
  })

  pgp.end()
}

void main()
