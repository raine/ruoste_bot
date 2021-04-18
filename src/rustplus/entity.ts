import * as Discord from 'discord.js'
import * as t from 'io-ts'
import { TypedEmitter } from 'tiny-typed-emitter'
import db, { Db, DEFAULT, pgp, skip } from '../db'
import { isMessageReply } from '../discord'
import log from '../logger'
import { validateP } from '../validate'
import { getCurrentWipe, getCurrentWipeForServer } from './server'
import {
  AppEntityInfo,
  EntityPairingNotificationData,
  RustPlusEvents
} from './types'

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
  discordSwitchMessageId: t.union([t.string, t.null]),
  discordPairingMessageId: t.union([t.string, t.null]),
  notFoundAt: t.union([t.string, t.null])
})

const entitiesColumnSet = new pgp.helpers.ColumnSet(
  [
    { name: 'created_at', prop: 'createdAt', def: DEFAULT, skip },
    { name: 'not_found_at', prop: 'notFoundAt', skip },
    { name: 'wipe_id', prop: 'wipeId', skip },
    { name: 'entity_id', prop: 'entityId', skip },
    { name: 'entity_type', prop: 'entityType', skip },
    { name: 'handle', skip },
    {
      name: 'discord_switch_message_id',
      prop: 'discordSwitchMessageId',
      def: null,
      skip
    },
    {
      name: 'discord_pairing_message_id',
      prop: 'discordPairingMessageId',
      def: null,
      skip
    }
  ],
  { table: 'entities' }
)

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
      return getEntityById(entityId, wipeId, tx)
    }
  })
}

export async function getEntityById(
  entityId: number,
  wipeId?: number,
  tx: Db = db
): Promise<Entity> {
  wipeId = wipeId ?? (await getCurrentWipe(tx))?.wipeId
  if (!wipeId) throw new Error('No current wipe')

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

export async function updateEntity(entity: Partial<Entity>): Promise<Entity> {
  return db.one(
    pgp.helpers.update(entity, entitiesColumnSet) +
      ' where wipe_id = $[wipeId] and entity_id = $[entityId] returning *',
    { ...entity }
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

export async function getEntities(
  entityType: EntityType,
  wipeId?: number
): Promise<Entity[]> {
  wipeId = wipeId ?? (await getCurrentWipe())?.wipeId
  if (!wipeId) throw new Error('No current wipe')

  return validateP(
    t.array(Entity),
    db.any(
      `select *
         from entities
        where wipe_id = $[wipeId]
          and entity_type = $[entityType]
          and not_found_at is null`,
      { wipeId, entityType }
    )
  )
}

export async function deleteEntities(
  entityIds: number[],
  wipeId?: number
): Promise<void> {
  wipeId = wipeId ?? (await getCurrentWipe())?.wipeId
  if (!wipeId) throw new Error('No current wipe')

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

export async function handleEntityHandleUpdateReply(
  events: TypedEmitter<RustPlusEvents>,
  msg: Discord.Message
) {
  if (isMessageReply(msg)) {
    const entity = await getEntityByDiscordPairingMessageId(
      msg.reference!.messageID!
    )
    if (entity) {
      log.info({ entity, handle: msg.content }, 'Updating handle for entity')
      const updated = await updateEntity({ ...entity, handle: msg.content })
      await msg.react('✅')
      events.emit('entityHandleUpdated', updated)
    }
  }
}
