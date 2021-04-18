import * as socket from './socket'
import * as rustplus from './'
import * as B from 'baconjs'
import { AppEntityChanged } from './types'

export interface SmartSwitch extends B.Property<boolean> {
  switchOn: () => Promise<void>
  switchOff: () => Promise<void>
  switchTo: (bool: boolean) => Promise<void>
}

export async function SmartSwitch(entityId: number): Promise<SmartSwitch> {
  const entityInfo = await socket.getEntityInfo(entityId)
  const initialValue = entityInfo.payload.value as boolean

  const property = B.fromEvent<AppEntityChanged>(
    rustplus.events,
    'entityChanged'
  )
    .filter((entityChanged) => entityChanged.entityId === entityId)
    .map((entityChanged) => (entityChanged as AppEntityChanged).payload.value)
    .toProperty(initialValue) as SmartSwitch

  async function switchTo(bool: boolean): Promise<void> {
    await socket.setEntityValueAsync(entityId, bool)
  }

  property.switchOn = () => switchTo(true)
  property.switchOff = () => switchTo(false)
  property.switchTo = (bool: boolean) => switchTo(bool)

  return property
}
