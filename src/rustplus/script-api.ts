import { SmartAlarm } from './smart-alarm'
import { SmartSwitch } from './smart-switch'
import { StorageMonitor } from './storage-monitor'
import { makeTeamMembersP } from './team-members-p'
import { makeTimeP } from './time-p'
import { RustPlusEventEmitter } from './types'
import { events } from './'
import { DiscordAPI } from '../discord'

export type ScriptAPI = {
  SmartSwitch: typeof SmartSwitch
  StorageMonitor: typeof StorageMonitor
  SmartAlarm: typeof SmartAlarm
  teamMembersP: ReturnType<typeof makeTeamMembersP>
  timeP: ReturnType<typeof makeTimeP>
  events: RustPlusEventEmitter
  discord: DiscordAPI
}

export function makeScriptAPI(discord: DiscordAPI): ScriptAPI {
  return {
    SmartAlarm,
    SmartSwitch,
    StorageMonitor,
    timeP: makeTimeP(),
    teamMembersP: makeTeamMembersP(),
    events,
    discord
  }
}
