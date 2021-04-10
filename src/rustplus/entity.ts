import * as t from 'io-ts'
import db, { Db } from '../db'
import log from '../logger'
import { validateP } from '../validate'
import { getCurrentWipeForServer } from './server'
import { AppEntityInfo, EntityPairingNotificationData } from './types'

export enum EntityType {
  Switch = 1,
  Alarm = 2,
  StorageMonitor = 3
}

export const Entity = t.type({
  wipeId: t.number,
  entityId: t.number,
  entityType: t.union([t.literal(1), t.literal(2), t.literal(3)]),
  handle: t.union([t.string, t.null]),
  discordSwitchMessageId: t.union([t.string, t.null])
})

const NotFoundError = t.type({ error: t.literal('not_found') })
export type NotFoundError = t.TypeOf<typeof NotFoundError>

export type Entity = t.TypeOf<typeof Entity>
export type EntityWithInfo = Entity & { entityInfo: AppEntityInfo }
export type EntityWithError = Entity & { entityInfo: NotFoundError }

export async function createEntityFromPairing({
  ip,
  port,
  entityId,
  entityType
}: EntityPairingNotificationData['body']): Promise<Entity> {
  return db.task(async (tx) => {
    const { wipeId } = await getCurrentWipeForServer({ host: ip, port }, tx)
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

export async function setDiscordPairingMessageId(
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

export async function setDiscordSwitchMessageId(
  entity: Entity,
  messageId: string
): Promise<void> {
  await db.none(
    `update entities
        set discord_switch_message_id = $[messageId]
      where wipe_id = $[wipeId] and entity_id = $[entityId]`,
    { ...entity, messageId }
  )
}

export async function getEntityByDiscordPairingMessageId(
  discordPairingMessageId: string
): Promise<Entity | null> {
  return validateP(
    t.union([Entity, t.null]),
    db.oneOrNone(
      `select *
         from entities
        where discord_pairing_message_id = $[discordPairingMessageId]`,
      { discordPairingMessageId }
    )
  )
}

export async function getEntityByDiscordSwitchMessageId(
  discordSwitchMessageId: string
): Promise<Entity | null> {
  return validateP(
    t.union([Entity, t.null]),
    db.oneOrNone(
      `select *
         from entities
        where discord_switch_message_id = $[discordSwitchMessageId]`,
      { discordSwitchMessageId }
    )
  )
}

export async function updateEntityHandle(
  entity: Entity,
  handle: string
): Promise<Entity> {
  return validateP(
    Entity,
    db.one(
      `update entities
        set handle = $[handle]
      where entity_id = $[entityId]
        and wipe_id = $[wipeId]
      returning *`,
      { ...entity, handle }
    )
  )
}

export async function getEntities(
  wipeId: number,
  entityType: EntityType
): Promise<Entity[]> {
  return validateP(
    t.array(Entity),
    db.any(
      `select *
         from entities
        where wipe_id = $[wipeId]
          and entity_type = $[entityType]`,
      { wipeId, entityType }
    )
  )
}

export async function deleteEntities(
  wipeId: number,
  entityIds: number[]
): Promise<void> {
  await db.none(
    `delete from entities
      where wipe_id = $[wipeId]
        and entity_id IN ($[entityIds:list])`,
    { entityIds, wipeId }
  )
}

export async function getAllEntities(
  entityType: EntityType
): Promise<Entity[]> {
  return validateP(
    t.array(Entity),
    db.any(
      `select *
         from entities
        where entity_type = $[entityType]`,
      { entityType }
    )
  )
}
