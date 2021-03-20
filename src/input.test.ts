import { parseMaxGroupOption } from './input'

describe('parseMaxGroupOption', () => {
  test('lower and upper bound', () => {
    expect(parseMaxGroupOption('/wipes maxgroup=2-4')).toEqual({
      minMaxGroup: 2,
      maxMaxGroup: 4
    })
  })

  test('no lower bound', () => {
    expect(parseMaxGroupOption('/wipes maxgroup=-2')).toEqual({
      minMaxGroup: 1,
      maxMaxGroup: 2
    })
  })

  test('no upper bound', () => {
    expect(parseMaxGroupOption('/wipes maxgroup=2-')).toEqual({
      minMaxGroup: 2,
      maxMaxGroup: Infinity
    })
  })

  test('single number', () => {
    expect(parseMaxGroupOption('/wipes maxgroup=2')).toEqual({
      minMaxGroup: 2,
      maxMaxGroup: 2
    })
  })
})
