import { pipe } from 'fp-ts/lib/function'
import * as Db from './db'
import * as TE from 'fp-ts/TaskEither'
import * as T from 'fp-ts/Task'
import * as E from 'fp-ts/Either'
import log from './logger'

async function main() {
  await pipe(
    Db.withTransaction((db) => Db.one(db, 'select lol')),
    T.map(
      E.fold(
        (err) => log.error(err),
        (val) => log.info(val)
      )
    )
  )()
}

void main()
