import * as socket from './rustplus-socket'
import * as B from 'baconjs'
import { AppTime } from './types'

export function makeTimeP(): B.Property<AppTime> {
  return B.fromPoll(1000, () => new B.Next(true))
    .flatMap(() => B.fromPromise(socket.getTime()))
    .toProperty()
}