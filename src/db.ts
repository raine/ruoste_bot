import pgPromise, { IColumnConfig } from 'pg-promise'
import { fold } from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import { camelCase, memoize } from 'lodash'
import { DateTime } from 'luxon'
import * as t from 'io-ts'

import * as path from 'path'
import { EitherAsync } from 'purify-ts/EitherAsync'
import { CustomError } from 'ts-custom-error'
import pg from 'pg-promise/typescript/pg-subset'
import { Either, Left, Right } from 'purify-ts/Either'
import { Maybe } from 'purify-ts/Maybe'

export class DbError extends CustomError {}

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

export function withCamelCaseProps(columnConfig: IColumnConfig<unknown>[]) {
  return columnConfig.map((column) => ({
    ...column,
    prop: camelCase(column.name)
  }))
}

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

export const one = <T>(
  db: pgPromise.IBaseProtocol<unknown>,
  query: pgPromise.QueryParam,
  values?: any
): EitherAsync<DbError, Maybe<T>> =>
  EitherAsync<DbError, T | null>(async ({ throwE }) => {
    try {
      return await db.oneOrNone<T>(query, values)
    } catch (e) {
      return throwE(new DbError(e.message))
    }
  }).map((x) => Maybe.fromNullable(x))

export const withDb = <T>(
  f: (db: pgPromise.IDatabase<unknown, pg.IClient>) => Promise<T>
): Promise<Either<DbError, T>> =>
  f(db)
    .then(Right)
    .catch((e) => Left(new DbError(e.message)))

// EitherAsync(
//   async ({ fromPromise }) =>
//     const x = await fromPromise(withDb((db) => db.oneOrNone(query, values)))
// )
