require('dotenv').config()
import db, { pgp } from '../../db'
import { distance, XY } from '../../math'
import { AppMarker } from '../'

const host = '178.33.128.186'
const port = 28108

const formatXY = ({ x, y }: XY): string => `X: ${x} Y: ${y}`

async function main() {
  const markersWithCargo = await db.any<{ markers: AppMarker[] }>(
    `select markers
       from map_markers
      where markers @> '[{"type": "CargoShip"}]'::jsonb`,
    { host, port }
  )

  markersWithCargo.forEach(({ markers }) => {
    const cargo = markers.find(({ type }) => type === 'CargoShip')!
    const crates = markers.filter(({ type }) => type === 'Crate')
    const cratesWithCargoDistance = crates
      .map((crate): AppMarker & {
        distanceFromCargoShip: number
      } => ({
        ...crate,
        distanceFromCargoShip: distance(cargo, crate)
      }))
      .filter((crate) => crate.distanceFromCargoShip < 100)

    if (cratesWithCargoDistance.length) {
      console.log(`Cargo Ship (${formatXY(cargo)})`)
      cratesWithCargoDistance.forEach(({ id, x, y, distanceFromCargoShip }) => {
        console.log(
          `Crate ${id} (${formatXY({
            x,
            y
          })}) Distance: ${distanceFromCargoShip}`
        )
      })
      console.log()
    }
  })

  pgp.end()
}

void main()
