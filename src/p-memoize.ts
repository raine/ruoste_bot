import memoizee from 'memoizee'

const pMemoize = <F extends (...args: any[]) => any>(
  fn: F,
  maxAge: number
): F & memoizee.Memoized<F> =>
  memoizee(fn, {
    promise: true,
    normalizer: (args: any) => JSON.stringify(args),
    maxAge
  })

export default pMemoize
