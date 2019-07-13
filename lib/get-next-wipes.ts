import * as B from 'baconjs'
import {
  ListServer,
  FullServer,
  getWipedServersCached1h,
  getServerCached1m
} from './just-wiped'
import { DateTime } from 'luxon'

const LEGIT_SERVERS = require('./legit-servers.json') as string[]

export const getNextWipes = (): B.Observable<FullServer[]> =>
  B.fromArray(LEGIT_SERVERS)
    .flatMap((query: string) =>
      B.fromPromise(getWipedServersCached1h({ q: query }))
    )
    .flatMap((servers) => B.fromArray(servers))
    .flatMapWithConcurrencyLimit(1, (server: ListServer) =>
      B.fromPromise(getServerCached1m(server.id))
    )
    .filter(
      (server: FullServer) =>
        server.nextWipe !== null &&
        server.nextWipe.date.startOf('day') >= DateTime.utc().startOf('day')
    )
    .scan([], (acc: FullServer[], s) => acc.concat(s))
    .filter((servers: FullServer[]) => servers.length > 0)
