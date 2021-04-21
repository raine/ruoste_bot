require('dotenv').config()
import db from '../../db'
import _ from 'lodash'
import { distance } from '../../math'

const host = '178.33.128.186'
const port = 28108

async function main() {
  const { monuments } = await db.one(
    `select data->'monuments' as monuments
       from maps
      where server_host = $[host]
        and server_port = $[port]
      order by created_at desc
      limit 1`,
    { host, port }
  )
  const launchSite = monuments.find((monument: any) =>
    monument.token.includes('launch')
  )
  const mapMarkers = await db.any(
    `select markers
       from map_markers
      where server_host = $[host]
        and server_port = $[port]`,
    { host, port }
  )
  const explosionMapMarkers = _.uniqBy(
    mapMarkers.flatMap((obj: any) =>
      obj.markers.filter((m: any) => m.type === 'Explosion')
    ),
    'id'
  )

  explosionMapMarkers.forEach(({ x, y }) => {
    console.log(
      `X: ${Math.round(x)}\tY: ${Math.round(
        y
      )}\tDistance to launch site: ${Math.round(
        distance({ x, y }, launchSite)
      )}`
    )
  })
}

void main()
