/* eslint-disable */
import * as socket from './socket'
import * as rustplus from './'
import * as B from 'baconjs'
import { AppEntityChanged } from './types'

export interface StorageMonitor extends B.Property<boolean> {}

export async function StorageMonitor(entityId: number): Promise<void> {
  const initialValue = await socket.getEntityInfo(entityId)
  console.log(
    require('util').inspect(initialValue, { colors: true, depth: Infinity })
  )

  // const property = B.fromEvent(rustplus.events, 'entityChanged')
  //   .map((entityChanged) => (entityChanged as AppEntityChanged).payload.value)
  //   .toProperty(initialValue) as StorageMonitor
  //
  // property.turnOn = async () => {
  //   await socket.setEntityValueAsync(entityId, true)
  // }
  //
  // property.turnOff = async () => {
  //   await socket.setEntityValueAsync(entityId, false)
  // }

  // return property
}
