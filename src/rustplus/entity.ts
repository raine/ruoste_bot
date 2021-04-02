import * as t from 'io-ts'
import log from '../logger'
import db from '../db'
import { getCurrentWipeIdForServer } from './server'
import { EntityPairingNotificationData } from './types'

export const Entity = t.type({
  wipeId: t.number,
  entityId: t.number,
  entityType: t.number,
  handle: t.union([t.string, t.null])
})

export type Entity = t.TypeOf<typeof Entity>

export async function createEntityFromPairing({
  ip,
  port,
  entityId,
  entityType
}: EntityPairingNotificationData['body']): Promise<void> {
  await db.task(async (t) => {
    const wipeId = await getCurrentWipeIdForServer({ host: ip, port }, t)
    const created = await t.oneOrNone(
      `insert into entities (wipe_id, entity_id, entity_type)
       values ($[wipeId], $[entityId], $[entityType])
       on conflict do nothing
       returning *
       `,
      { wipeId, entityId, entityType }
    )

    if (created) {
      log.info(created, 'Entity created')
    }
  })
}
