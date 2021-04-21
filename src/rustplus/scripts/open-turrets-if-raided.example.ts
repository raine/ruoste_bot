import { events, setSwitch } from '@ruoste_bot/rustplus'
import { EntityType, getEntities } from '@ruoste_bot/rustplus/entity'

async function activateTurrets() {
  return Promise.all(
    (await getEntities(EntityType.Switch))
      .filter(({ handle }) => handle?.toLowerCase().includes('turrets'))
      .map(({ entityId }) => setSwitch(entityId, true))
  )
}

export default function script() {
  events.on('killedWhileOffline', activateTurrets)
  events.on('storageMonitorNotFound', async (storageMonitor) => {
    if (storageMonitor.handle?.match(/main/)) {
      await activateTurrets()
    }
  })
}
