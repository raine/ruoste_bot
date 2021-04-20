import { makeTimeP } from '../time-p'
import { SmartSwitch } from '../smart-switch'

export default async function lightsDuringDay() {
  const timeP = makeTimeP()
  const lightSwitch = await SmartSwitch('lights')
  const shouldLightsBeOn = timeP
    .map(({ time, sunset, sunrise }) => time <= sunrise || time >= sunset)
    .skipDuplicates()
  shouldLightsBeOn.onValue(lightSwitch.switchTo)
}
