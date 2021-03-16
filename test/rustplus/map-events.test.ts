import { validate } from '../../src/validate'
import * as t from 'io-ts'
import { AppMarker } from '../../src/rustplus'
import {
  getMapEvents,
  getNewMarkers,
  getRemovedMarkers
} from '../../src/rustplus/map-events'

const CRATE = {
  id: 137827068,
  type: 'Crate',
  x: -56.0625,
  y: 1617.395263671875,
  steamId: '0',
  rotation: 0,
  radius: 0,
  color1: { x: 0, y: 0, z: 0, w: 0 },
  color2: { x: 0, y: 0, z: 0, w: 0 },
  alpha: 0,
  name: ''
}

const CARGO_SHIP = {
  x: 5879.240234375,
  y: 12.6767578125,
  id: 129479730,
  type: 'CargoShip',
  alpha: 0,
  color1: { w: 0, x: 0, y: 0, z: 0 },
  color2: { w: 0, x: 0, y: 0, z: 0 },
  radius: 0,
  steamId: '0',
  rotation: 69.85646057128906,
  name: ''
}

const markers = (xs: any) => validate(t.array(AppMarker), xs)

describe('getNewMarkers()', () => {
  test('returns new markers', () => {
    const markers1 = markers([CRATE])
    const markers2 = markers([CRATE, CARGO_SHIP])
    expect(getNewMarkers(markers1, markers2)).toEqual([CARGO_SHIP])
  })
})

describe('getRemovedMarkers()', () => {
  test('returns removed markers', () => {
    const markers1 = markers([CRATE, CARGO_SHIP])
    const markers2 = markers([CRATE])
    expect(getRemovedMarkers(markers1, markers2)).toEqual([CARGO_SHIP])
  })
})

describe('getMapEvents()', () => {
  test('cargo ship entered', () => {
    const markers1 = markers([CRATE])
    const markers2 = markers([CRATE, CARGO_SHIP])
    expect(getMapEvents(markers1, markers2)).toEqual([
      { type: 'CARGO_SHIP_ENTERED' }
    ])
  })

  test('cargo ship left', () => {
    const markers1 = markers([CRATE, CARGO_SHIP])
    const markers2 = markers([CRATE])
    expect(getMapEvents(markers1, markers2)).toEqual([
      { type: 'CARGO_SHIP_LEFT' }
    ])
  })
})
