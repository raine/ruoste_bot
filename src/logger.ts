import pino from 'pino'

const logger = pino({
  prettyPrint:
    process.env.NODE_ENV !== 'production'
      ? { ignore: 'pid,hostname,time' }
      : false,
  level:
    process.env.LOG_LEVEL ??
    (process.env.NODE_ENV !== 'production' ? 'debug' : 'info')
})
export default logger
