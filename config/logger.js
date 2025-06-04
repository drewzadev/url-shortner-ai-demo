import winston from 'winston'

const { createLogger, format, transports } = winston

// Define log levels
const logLevels = {
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  silly: 5
}

// Define log colors
const logColors = {
  fatal: 'red',
  error: 'red',
  warn: 'yellow',
  info: 'green',
  debug: 'blue',
  silly: 'magenta'
}

winston.addColors(logColors)

// Create custom format
const customFormat = format.combine(
  format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  format.errors({ stack: true }),
  format.json()
)

// Development format with colors
const developmentFormat = format.combine(
  format.colorize({ all: true }),
  format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  format.errors({ stack: true }),
  format.printf(({ timestamp, level, message, ...meta }) => {
    // Handle the case where message is actually an array (splat format)
    let logMessage = message
    let logMeta = { ...meta }
    
    // If message is an array, combine the elements
    if (Array.isArray(message)) {
      logMessage = message.join(' ')
    } else if (typeof message === 'object' && message !== null) {
      // If message is an object, it might be metadata
      logMessage = 'Log entry'
      logMeta = { ...message, ...meta }
    }
    
    // Remove service metadata from main message if it exists
    if (logMeta.service) {
      delete logMeta.service
    }
    if (logMeta.version) {
      delete logMeta.version
    }
    
    let log = `${timestamp} [${level}]: ${logMessage}`
    
    if (Object.keys(logMeta).length > 0) {
      log += ` ${JSON.stringify(logMeta)}`
    }
    
    return log
  })
)

// Determine log level from environment
const getLogLevel = () => {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase()
  const validLevels = Object.keys(logLevels)
  
  if (envLevel && validLevels.includes(envLevel)) {
    return envLevel
  }
  
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug'
}

// Create logger instance
const logger = createLogger({
  levels: logLevels,
  level: getLogLevel(),
  format: process.env.NODE_ENV === 'production' ? customFormat : developmentFormat,
  defaultMeta: {
    service: 'url-shortener',
    version: process.env.npm_package_version || '0.0.1'
  },
  transports: [
    new transports.Console({
      handleExceptions: true,
      handleRejections: true
    })
  ],
  exitOnError: false
})

// Add fatal level method
logger.fatal = (message, ...args) => {
  logger.log('fatal', message, ...args)
}

// Override the default logging methods to handle our prefix pattern
const originalInfo = logger.info
const originalError = logger.error
const originalWarn = logger.warn
const originalDebug = logger.debug

logger.info = (prefix, message, ...args) => {
  if (typeof prefix === 'string' && typeof message === 'string') {
    originalInfo.call(logger, `${prefix}: ${message}`, ...args)
  } else {
    originalInfo.call(logger, prefix, message, ...args)
  }
}

logger.error = (prefix, message, ...args) => {
  if (typeof prefix === 'string' && typeof message === 'string') {
    originalError.call(logger, `${prefix}: ${message}`, ...args)
  } else {
    originalError.call(logger, prefix, message, ...args)
  }
}

logger.warn = (prefix, message, ...args) => {
  if (typeof prefix === 'string' && typeof message === 'string') {
    originalWarn.call(logger, `${prefix}: ${message}`, ...args)
  } else {
    originalWarn.call(logger, prefix, message, ...args)
  }
}

logger.debug = (prefix, message, ...args) => {
  if (typeof prefix === 'string' && typeof message === 'string') {
    originalDebug.call(logger, `${prefix}: ${message}`, ...args)
  } else {
    originalDebug.call(logger, prefix, message, ...args)
  }
}

// Override console methods in development
if (process.env.NODE_ENV !== 'production') {
  console.log = (...args) => logger.info(args.join(' '))
  console.error = (...args) => logger.error(args.join(' '))
  console.warn = (...args) => logger.warn(args.join(' '))
  console.info = (...args) => logger.info(args.join(' '))
}

export default logger