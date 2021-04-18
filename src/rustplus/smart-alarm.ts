import * as socket from './socket'
import * as rustplus from './'
import * as B from 'baconjs'
import { AppEntityChanged } from './types'

export async function SmartAlarm(
  entityId: number
): Promise<B.Property<boolean>> {
  const entityInfo = await socket.getEntityInfo(entityId)
  const initialValue = entityInfo.payload.value as boolean
  const property = B.fromEvent<AppEntityChanged>(
    rustplus.events,
    'entityChanged'
  )
    .filter((entityChanged) => entityChanged.entityId === entityId)
    .map((entityChanged) => (entityChanged as AppEntityChanged).payload.value)
    .toProperty(initialValue)

  return property
}
