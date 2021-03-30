import { TypedEmitter } from 'tiny-typed-emitter'
import { RustPlusEvents } from './types'

const events = new TypedEmitter<RustPlusEvents>()

export default events
