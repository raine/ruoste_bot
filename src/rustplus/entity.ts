import * as t from 'io-ts'
import db, { Db } from '../db'
import log from '../logger'
import { validateP } from '../validate'
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
}: EntityPairingNotificationData['body']): Promise<Entity> {
  return db.task(async (tx) => {
    const wipeId = await getCurrentWipeIdForServer({ host: ip, port }, tx)
    const created = await validateP(
      t.union([Entity, t.null]),
      tx.oneOrNone(
        `insert into entities (wipe_id, entity_id, entity_type)
         values ($[wipeId], $[entityId], $[entityType])
         on conflict do nothing
         returning *
       `,
        { wipeId, entityId, entityType }
      )
    )

    if (created) {
      log.info(created, 'Entity created')
      return created
    } else {
      return getEntityWithWipeAndEntityId(wipeId, entityId, tx)
    }
  })
}

export async function getEntityWithWipeAndEntityId(
  wipeId: number,
  entityId: number,
  tx: Db = db
): Promise<Entity> {
  return validateP(
    Entity,
    tx.one(
      `select *
         from entities
        where wipe_id = $[wipeId]
          and entity_id = $[entityId]`,
      { wipeId, entityId }
    )
  )
}

export async function setDiscordMessageId(
  entity: Entity,
  messageId: string
): Promise<void> {
  await db.none(
    `update entities
        set discord_pairing_message_id = $[messageId]
      where wipe_id = $[wipeId] and entity_id = $[entityId]`,
    { ...entity, messageId }
  )
}

export async function updateEntityHandle(
  messageId: string,
  messageText: string
): Promise<void> {
  await db.none(
    `update entities
        set handle = $[handle]
      where discord_pairing_message_id = $[messageId]`,
    { handle: messageText, messageId }
  )
}
