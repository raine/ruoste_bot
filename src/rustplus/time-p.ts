import * as socket from './socket'
import * as B from 'baconjs'
import { AppTime } from './types'

export function makeTimeP(): B.Property<AppTime> {
  return B.fromPoll(5000, () => new B.Next(true))
    .flatMap(() => B.fromPromise(socket.getTime()))
    .toProperty()
}
