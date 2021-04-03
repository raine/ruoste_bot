import { SmartAlarm } from './smart-alarm'
import { SmartSwitch } from './smart-switch'
import { makeTimeP } from './time-p'
import { makeTeamMembersP } from './team-members-p'
import { StorageMonitor } from './storage-monitor'

export type ScriptApi = {
  SmartSwitch: typeof SmartSwitch
  StorageMonitor: typeof StorageMonitor
  SmartAlarm: typeof SmartAlarm
  teamMembersP: ReturnType<typeof makeTeamMembersP>
  timeP: ReturnType<typeof makeTimeP>
}

export function makeScriptApi(): ScriptApi {
  return {
    SmartAlarm,
    SmartSwitch,
    StorageMonitor,
    timeP: makeTimeP(),
    teamMembersP: makeTeamMembersP()
  }
}
