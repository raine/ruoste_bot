import { SmartAlarm } from './smart-alarm'
import { SmartSwitch } from './smart-switch'
import { StorageMonitor } from './storage-monitor'
import { makeTeamMembersP } from './team-members-p'
import { makeTimeP } from './time-p'
import { RustPlusEventEmitter } from './types'
import { events } from './'

export type ScriptApi = {
  SmartSwitch: typeof SmartSwitch
  StorageMonitor: typeof StorageMonitor
  SmartAlarm: typeof SmartAlarm
  teamMembersP: ReturnType<typeof makeTeamMembersP>
  timeP: ReturnType<typeof makeTimeP>
  events: RustPlusEventEmitter
}

export function makeScriptApi(): ScriptApi {
  return {
    SmartAlarm,
    SmartSwitch,
    StorageMonitor,
    timeP: makeTimeP(),
    teamMembersP: makeTeamMembersP(),
    events
  }
}
