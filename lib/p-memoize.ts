import * as memoize from 'memoizee'

const pMemoize = (fn: any, opts = {}) =>
  memoize(fn, {
    promise: true,
    normalizer: (args: any) => JSON.stringify(args),
    ...opts
  })

export default pMemoize
