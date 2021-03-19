import pino from 'pino'

const logger = pino({
  prettyPrint:
    process.env.NODE_ENV !== 'production'
      ? { ignore: 'pid,hostname,time' }
      : false,
  level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info'
})
export default logger
