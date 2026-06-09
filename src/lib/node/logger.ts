import pino from 'pino'

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  // KHÔNG log password/token/secret — redact các field nhạy cảm
  redact: ['password', 'passwordHash', 'token', 'secret', 'authorization'],
  ...(process.env.NODE_ENV === 'development'
    ? { transport: { target: 'pino/file', options: { destination: 1 } } }
    : {}),
})

export default logger
