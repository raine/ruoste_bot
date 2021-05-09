import * as E from 'fp-ts/Either'
import * as t from 'io-ts'
import * as T from 'fp-ts/Task'
import { constant, constUndefined, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/Option'
import * as TE from 'fp-ts/TaskEither'
import { camelCase, memoize } from 'lodash'
import { DateTime } from 'luxon'
import * as path from 'path'
import pgPromise, { IColumnConfig } from 'pg-promise'
import pg from 'pg-promise/typescript/pg-subset'
import { CustomError } from 'ts-custom-error'
import { FormattedValidationError, isError } from './errors'

export class DbError extends CustomError {
  type = 'DbError' as const
}
export class DbQueryResultError extends CustomError {
  type = 'DbQueryResultError' as const
}
export class DbResultValidationError extends FormattedValidationError {
  type = 'DbResultValidationError' as const
}

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

export const toDbError = (err: unknown): DbError =>
  new DbError(isError(err) ? err.message : 'Query error')

export const none = (
  db: pgPromise.IBaseProtocol<unknown>,
  query: pgPromise.QueryParam,
  values?: any
): TE.TaskEither<DbError, void> =>
  pipe(
    TE.tryCatch(() => db.none(query, values), toDbError),
    TE.map(constUndefined)
  )

export const one = <A>(
  db: pgPromise.IBaseProtocol<unknown>,
  type: t.Decoder<unknown, A>,
  query: pgPromise.QueryParam,
  values?: any
): TE.TaskEither<DbError | DbResultValidationError, O.Option<A>> =>
  pipe(
    TE.tryCatch(() => db.oneOrNone<A>(query, values), toDbError),
    TE.map(O.fromNullable),
    T.map(
      E.chainW(
        O.fold(
          () => E.right(O.none),
          (a) =>
            pipe(
              type.decode(a),
              E.mapLeft((errors) => new DbResultValidationError(errors)),
              E.map(O.some)
            )
        )
      )
    )
  )

export const noResultToError = <A>(
  te: TE.TaskEither<DbError, O.Option<A>>
): TE.TaskEither<DbError | DbQueryResultError, A> =>
  pipe(
    te,
    TE.map(
      E.fromOption(
        () => new DbQueryResultError('Expected query to return a row')
      )
    ),
    TE.chainW(TE.fromEither)
  )

// eslint-disable-next-line @typescript-eslint/ban-types
export type DbPoolClient = pgPromise.IConnected<{}, pg.IClient>

export const connect = (): TE.TaskEither<DbError, DbPoolClient> =>
  TE.tryCatch(() => db.connect(), toDbError)

export const withTransaction = <E, A>(
  program: (db: DbPoolClient) => TE.TaskEither<E, A>
): TE.TaskEither<E | DbError, A> =>
  pipe(
    connect(),
    TE.chainW((db) =>
      pipe(
        none(db, 'BEGIN'),
        TE.chainW(() => program(db)),
        TE.chainW((a) => pipe(none(db, 'COMMIT'), TE.map(constant(a)))),
        TE.orElseW((err) =>
          pipe(
            none(db, 'ROLLBACK'),
            TE.chain(() => TE.left(err))
          )
        )
      )
    )
  )
