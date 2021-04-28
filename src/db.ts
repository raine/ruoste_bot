import * as E from 'fp-ts/Either'
import { pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/Option'
import * as TE from 'fp-ts/TaskEither'
import { camelCase, memoize } from 'lodash'
import { DateTime } from 'luxon'
import * as path from 'path'
import pgPromise, { IColumnConfig } from 'pg-promise'
import { CustomError } from 'ts-custom-error'
import { isError } from './errors'

export class DbError extends CustomError {}
export class QueryResultDbError extends CustomError {}

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
): TE.TaskEither<DbError, O.Option<T>> =>
  pipe(
    TE.tryCatch(
      () => db.oneOrNone<T>(query, values),
      (err: unknown) => new DbError(isError(err) ? err.message : 'Query error')
    ),
    TE.map(O.fromNullable)
  )

export const noResultToError = <A>(
  te: TE.TaskEither<DbError, O.Option<A>>
): TE.TaskEither<DbError | QueryResultDbError, A> =>
  pipe(
    te,
    TE.map(
      E.fromOption(
        () => new QueryResultDbError('Expected query to return a row')
      )
    ),
    TE.chainW(TE.fromEither)
  )

export const connect = () =>
  pipe(
    TE.tryCatch(
      () => db.connect(),
      (err: unknown) => new DbError(isError(err) ? err.message : 'Query error')
    )
  )
