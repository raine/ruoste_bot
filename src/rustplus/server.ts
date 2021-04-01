import { ServerHostPort, ServerInfo } from './types'
import db, { Db } from '../db'

export function upsertServer(
  server: ServerHostPort & { playerToken: number }
): Promise<any> {
  return db.task(async (t) => {
    await t.none(
      `insert into servers (server_host, server_port, player_token)
       values ($[host], $[port], $[playerToken])
       on conflict (server_host, server_port)
       do update set player_token = excluded.player_token`,
      server
    )
  })
}

export function createWipeIfNotExist(serverInfo: ServerInfo): Promise<void> {
  return db.task(async (t) => {
    const serverId = await getServerId(serverInfo)
    const wipeExists = await t.oneOrNone<{ column: 1 }>(
      `select 1
         from wipes
        where server_id = $[serverId]
          and wiped_at = $[wipeTime]`,
      { serverId, ...serverInfo }
    )

    if (!wipeExists) {
      await t.none(
        `insert into wipes (wiped_at, server_id, map_size, seed)
         values ($[wipeTime], $[serverId], $[mapSize], $[seed])`,
        { serverId, ...serverInfo }
      )
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
      where server_host = $[host]
        and server_port = $[port]
        and wiped_at = $[wipeTime]`,
    serverInfo
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
      where server_host = $[host]
        and server_port = $[port]`,
    server
  )

  return serverId
}
