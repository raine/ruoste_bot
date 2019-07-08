import * as memoizee from 'memoizee'

const pMemoize = <F extends Function>(
  fn: F,
  maxAge: number
): F & memoizee.Memoized<F> =>
  memoizee(fn, {
    promise: true,
    normalizer: (args: any) => JSON.stringify(args),
    maxAge
  })

export default pMemoize
