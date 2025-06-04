import logger from '../config/logger.js'
import moment from 'moment'

class LoggingMiddleware {
  constructor() {
    this.logPrefix = 'LoggingMiddleware'
    this.logger = logger
  }

  _formatRequestLog(req, res, responseTime) {
    const logData = {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      userAgent: req.get('User-Agent') || 'unknown',
      ip: req.ip || req.connection.remoteAddress,
      timestamp: moment().toISOString()
    }

    if (req.body && Object.keys(req.body).length > 0) {
      logData.bodySize = JSON.stringify(req.body).length
    }

    if (req.query && Object.keys(req.query).length > 0) {
      logData.queryParams = Object.keys(req.query).length
    }

    return logData
  }

  _getLogLevel(statusCode) {
    if (statusCode >= 500) return 'error'
    if (statusCode >= 400) return 'warn'
    if (statusCode >= 300) return 'info'
    return 'info'
  }

  middleware() {
    return (req, res, next) => {
      const startTime = Date.now()

      // Override res.end to capture response details
      const originalEnd = res.end
      res.end = (...args) => {
        const responseTime = Date.now() - startTime
        const logData = this._formatRequestLog(req, res, responseTime)
        const logLevel = this._getLogLevel(res.statusCode)

        this.logger[logLevel](this.logPrefix, 'HTTP Request', logData)

        // Call original end method
        originalEnd.apply(res, args)
      }

      // Log incoming request
      this.logger.debug(this.logPrefix, 'Incoming request', {
        method: req.method,
        url: req.url,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent') || 'unknown'
      })

      next()
    }
  }
}

const loggingMiddleware = new LoggingMiddleware()
export default loggingMiddleware.middleware()