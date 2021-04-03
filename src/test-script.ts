import type { ScriptApi } from './rustplus/script-api'
import * as B from 'baconjs'
console.log(B.try)

export default async function main({
  SmartSwitch,
  SmartAlarm
}: ScriptApi): Promise<() => void> {
  const switcher = await SmartSwitch(1159592)
  const lightSwitch = await SmartSwitch(1159593)
  const alarm = await SmartAlarm(1179640)
  const alarmDelayedOff = alarm.flatMapFirst((bool) =>
    B.once(bool).merge(B.later(2000, false))
  )
  const shouldLightBeOn = switcher.delay(1000).or(alarmDelayedOff)
  const unsub = shouldLightBeOn.onValue(lightSwitch.switchTo)

  return () => {
    unsub()
  }
}
