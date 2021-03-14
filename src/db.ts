import pgPromise from 'pg-promise'
import camelCase from 'lodash.camelcase'

// Based on https://github.com/vitaly-t/pg-promise/issues/78#issuecomment-171951303
function camelizeColumnNames(data: any[]) {
  const template = data[0]
  for (const prop in template) {
    // eslint-disable-next-line no-prototype-builtins
    if (template.hasOwnProperty(prop)) {
      const camel = camelCase(prop)
      if (!(camel in template)) {
        for (const d of data) {
          d[camel] = d[prop]
          delete d[prop]
        }
      }
    }
  }
}

export type Db = pgPromise.IBaseProtocol<unknown>
export const pgp = pgPromise({
  receive: camelizeColumnNames
})

const db = pgp({
  connectionString: process.env.DATABASE_URL
})

export default db
