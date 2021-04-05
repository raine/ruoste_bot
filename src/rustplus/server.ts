import * as t from 'io-ts'
import { ServerHostPort, ServerInfo } from './types'
import db, { Db } from '../db'
import { validateP } from '../validate'

export const Server = t.type({
  host: t.string,
  port: t.number,
  playerToken: t.number,
  playerSteamId: t.string
})

export type Server = t.TypeOf<typeof Server>

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

export function createWipeIfNotExist(serverInfo: ServerInfo): Promise<number> {
  return db.task(async (t) => {
    const serverId = await getServerId(serverInfo)
    const existing = await t.oneOrNone<{ wipeId: number }>(
      `select wipe_id
         from wipes
        where server_id = $[serverId]
          and wiped_at = $[wipeTime]`,
      { serverId, ...serverInfo }
    )

    if (!existing) {
      return (
        await t.one<{ wipeId: number }>(
          `insert into wipes (wiped_at, server_id, map_size, seed)
           values ($[wipeTime], $[serverId], $[mapSize], $[seed])
           returning wipe_id`,
          { serverId, ...serverInfo }
        )
      ).wipeId
    } else {
      return existing.wipeId
    }
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

export async function getCurrentWipeIdForServer(
  server: Pick<ServerInfo, 'host' | 'port'>,
  tx: Db = db
) {
  const { wipeId } = await tx.one<{ wipeId: number }>(
    `select wipe_id
       from servers
       join wipes using (server_id)
      where host = $[host]
        and port = $[port]
      order by wipe_id desc
      limit 1`,
    server
  )

  return wipeId
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
