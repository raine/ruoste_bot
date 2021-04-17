import pgPromise from 'pg-promise'
import { camelCase, memoize } from 'lodash'
import { DateTime } from 'luxon'

import * as path from 'path'

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

export const sqlFile = memoize((file) => {
  const queryFile = new pgp.QueryFile(path.join(__dirname, '..', 'sql', file), {
    // sql files are reloaded automatically without having to restart node server
    debug: process.env.NODE_ENV !== 'production'
  })
  if (queryFile.error) {
    throw queryFile.error
  } else {
    return queryFile
  }
})

export type Db = pgPromise.IBaseProtocol<unknown>
export const pgp = pgPromise({
  receive: camelizeColumnNames
})

// Convert timestamptz field to ISO 8601
pgp.pg.types.setTypeParser(1184, (str) =>
  DateTime.fromJSDate(new Date(str)).toISO()
)

const db = pgp({
  connectionString: process.env.DATABASE_URL
})

export const DEFAULT = {
  toPostgres: () => 'DEFAULT',
  rawType: true
}

export const skip = ({ exists }: any) => !exists

export default db
