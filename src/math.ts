export type XY = { x: number; y: number }

export function distance({ x: x1, y: y1 }: XY, { x: x2, y: y2 }: XY) {
  const a = x1 - x2
  const b = y1 - y2
  return Math.sqrt(a * a + b * b)
}
