import * as t from 'io-ts'

export const XY = t.type({ x: t.number, y: t.number })
export type XY = t.TypeOf<typeof XY>

export function distance({ x: x1, y: y1 }: XY, { x: x2, y: y2 }: XY) {
  const a = x1 - x2
  const b = y1 - y2
  return Math.sqrt(a * a + b * b)
}
