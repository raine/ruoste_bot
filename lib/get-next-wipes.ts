import * as B from 'baconjs'
import {
  ListServer,
  FullServer,
  getWipedServersCached1h,
  getServerCached1m
} from './just-wiped'
import { DateTime } from 'luxon'

const LEGIT_SERVERS = require('./legit-servers.json') as string[]

export const getNextWipes = (): B.Observable<{
  serverCount: number
  fetchedCount: number
  servers: FullServer[]
}> => {
  const listServers = B.fromArray(LEGIT_SERVERS)
    .flatMapWithConcurrencyLimit(1, (query: string) =>
      B.fromPromise(getWipedServersCached1h({ q: query }))
    )
    .flatMap((servers) => B.fromArray(servers))
  const serverCount = listServers.scan(0, (acc) => acc + 1)
  const servers = listServers.flatMapWithConcurrencyLimit(
    1,
    (server: ListServer) => B.fromPromise(getServerCached1m(server.id))
  )
  const fetchedCount = servers.scan(0, (acc) => acc + 1)
  return B.combineTemplate({
    serverCount,
    fetchedCount,
    servers: servers
      .filter(
        (server: FullServer) =>
          server.nextWipe !== null &&
          server.nextWipe.date.startOf('day') >= DateTime.utc().startOf('day')
      )
      .scan([], (acc: FullServer[], s) => acc.concat(s))
  })
}
