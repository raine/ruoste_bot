import * as winston from 'winston'

const { createLogger, format, transports } = winston
const { combine } = format

const logger = createLogger({
  format: combine(
    format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  transports: [new transports.Console()]
})

export default logger
