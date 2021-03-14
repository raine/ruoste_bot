import pino from 'pino'

const logger = pino({
  prettyPrint:
    process.env.NODE_ENV !== 'production'
      ? { ignore: 'pid,hostname,time' }
      : false
})
export default logger
