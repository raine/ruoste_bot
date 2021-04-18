import * as rustplus from '.'
import * as socket from './socket'
import * as B from 'baconjs'
import { AppTeamChanged, Member } from './types'

export function makeTeamMembersP(): B.Property<Member[]> {
  const teamChangedE = B.fromEvent<AppTeamChanged>(
    rustplus.events,
    'teamChanged'
  ).map((obj) => obj.teamInfo.members)
  const initialE = B.fromPromise(socket.getTeamInfo()).map(
    (teamInfo) => teamInfo.members
  )
  return initialE.merge(teamChangedE).toProperty()
}
