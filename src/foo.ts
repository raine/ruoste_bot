import { CustomError } from 'ts-custom-error'

export class Error1 extends CustomError {
  type = 'Error1'
}

export class Error2 extends CustomError {
  type = 'Error2'
}

const x: Error | Error1 = new Error1()
const y: Error = new Error1() // no type error because Error has no `type`

// Type 'Error' is not assignable to type 'Error1 | Error2'
const z: Error1 | Error2 = new Error()
