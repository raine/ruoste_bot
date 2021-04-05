import * as t from 'io-ts'
import { ServerHostPort, ServerInfo } from './types'
import db, { Db } from '../db'
import { validateP } from '../validate'
import { XY } from '../math'

export const Server = t.type({
  host: t.string,
  port: t.number,
  playerToken: t.number,
  playerSteamId: t.string
})

export type Server = t.TypeOf<typeof Server>

export const Wipe = t.type({
  wipeId: t.number,
  wipedAt: t.string,
  serverId: t.number,
  mapSize: t.number,
  seed: t.number,
  createdAt: t.string,
  baseLocation: t.union([XY, t.null])
})

export type Wipe = t.TypeOf<typeof Wipe>

export function upsertServer(
  server: ServerHostPort & {
    playerToken: number
    playerSteamId: string
  }
): Promise<any> {
  return db.task(async (t) => {
    await t.none(
      `insert into servers (host, port, player_token, player_steam_id)
       values ($[host], $[port], $[playerToken], $[playerSteamId])
       on conflict (host, port)
       do update set player_token = excluded.player_token, player_steam_id = excluded.player_steam_id`,
      server
    )
  })
}

export function createWipeIfNotExist(serverInfo: ServerInfo): Promise<Wipe> {
  return db.task(async (tx) => {
    const serverId = await getServerId(serverInfo)
    const existing = await validateP(
      t.union([Wipe, t.null]),
      tx.oneOrNone(
        `select *
           from wipes
          where server_id = $[serverId]
            and wiped_at = $[wipeTime]`,
        { serverId, ...serverInfo }
      )
    )

    return (
      existing ??
      validateP(
        Wipe,
        tx.one(
          `insert into wipes (wiped_at, server_id, map_size, seed)
           values ($[wipeTime], $[serverId], $[mapSize], $[seed])
           returning *`,
          { serverId, ...serverInfo }
        )
      )
    )
  })
}

export async function getWipeId(
  serverInfo: ServerInfo,
  tx: Db = db
): Promise<number> {
  const { wipeId } = await tx.one<{ wipeId: number }>(
    `select wipe_id
       from servers
       join wipes using (server_id)
      where host = $[host]
        and port = $[port]
        and wiped_at = $[wipeTime]`,
    serverInfo
  )

  return wipeId
}

export async function getWipeById(wipeId: number, tx: Db = db): Promise<Wipe> {
  return validateP(
    Wipe,
    tx.one(`select * from wipes where wipe_id = $[wipeId]`, { wipeId })
  )
}

export async function getCurrentWipeForServer(
  server: Pick<ServerInfo, 'host' | 'port'>,
  tx: Db = db
) {
  const wipe = await validateP(
    Wipe,
    tx.one(
      `select *
         from servers
         join wipes using (server_id)
        where host = $[host]
          and port = $[port]
        order by wipe_id desc
        limit 1`,
      server
    )
  )

  return wipe
}

export async function getServerId(
  server: Pick<ServerInfo, 'host' | 'port'>,
  tx: Db = db
): Promise<number> {
  const { serverId } = await tx.one<{ serverId: number }>(
    `select server_id
       from servers
      where host = $[host]
        and port = $[port]`,
    server
  )

  return serverId
}

export async function getCurrentServer(tx: Db = db): Promise<Server | null> {
  return validateP(
    t.union([Server, t.null]),
    tx.oneOrNone(
      `select *
         from servers
        where server_id = (
          select current_server_id
            from rustplus_config
          )`
    )
  )
}

export async function updateWipeBaseLocation(
  wipeId: number,
  coords: XY
): Promise<void> {
  await db.none(
    `update wipes
        set base_location = $[coords]
      where wipe_id = $[wipeId]`,
    { wipeId, coords }
  )
}
