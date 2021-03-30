import type { RustPlus } from './rustplus/types'
import * as B from 'baconjs'

export async function main({ SmartSwitch, SmartAlarm }: RustPlus) {
  const switcher = await SmartSwitch(1159592)
  const lightSwitch = await SmartSwitch(1159593)
  const alarm = await SmartAlarm(1179640)
  const alarmDelayedOff = alarm.flatMapFirst((bool) =>
    B.once(bool).merge(B.later(2000, false))
  )
  const shouldLightBeOn = switcher.delay(1000).or(alarmDelayedOff)
  shouldLightBeOn.onValue(lightSwitch.switchTo)
}
