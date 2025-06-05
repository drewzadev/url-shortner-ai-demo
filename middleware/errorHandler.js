class ErrorHandler {
  constructor(logger) {
    this.logPrefix = 'ErrorHandler'
    this.logger = logger
  }

  _getErrorType(error) {
    if (error.name === 'ValidationError') return 'validation'
    if (error.name === 'CastError') return 'cast'
    if (error.code === 'ECONNREFUSED') return 'connection'
    if (error.code === 'ETIMEDOUT') return 'timeout'
    if (error.statusCode || error.status) return 'http'
    return 'unknown'
  }

  _getStatusCode(error) {
    if (error.statusCode || error.status) {
      return error.statusCode || error.status
    }
    
    switch (error.name) {
      case 'ValidationError':
        return 400
      case 'CastError':
        return 400
      case 'UnauthorizedError':
        return 401
      case 'ForbiddenError':
        return 403
      case 'NotFoundError':
        return 404
      default:
        return 500
    }
  }

  _formatErrorResponse(error, req) {
    const statusCode = this._getStatusCode(error)
    const errorType = this._getErrorType(error)
    
    const errorResponse = {
      error: true,
      message: error.message || 'Internal Server Error',
      statusCode,
      type: errorType,
      timestamp: new Date().toISOString()
    }

    // Add request context in development
    if (process.env.NODE_ENV === 'development') {
      errorResponse.path = req.path
      errorResponse.method = req.method
      errorResponse.stack = error.stack
    }

    // Add error details for specific error types
    if (errorType === 'validation' && error.details) {
      errorResponse.details = error.details
    }

    return errorResponse
  }

  _shouldLogError(statusCode) {
    // Don't log client errors (4xx) as errors, log as warnings
    // Do log server errors (5xx) as errors
    return statusCode >= 500
  }

  middleware() {
    return (error, req, res, next) => {
      const statusCode = this._getStatusCode(error)
      const errorResponse = this._formatErrorResponse(error, req)

      // Log the error with appropriate level
      const logData = {
        error: error.message,
        statusCode,
        path: req.path,
        method: req.method,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent') || 'unknown',
        stack: error.stack
      }

      if (this._shouldLogError(statusCode)) {
        this.logger.error(this.logPrefix, 'Server error occurred', logData)
      } else {
        this.logger.warn(this.logPrefix, 'Client error occurred', logData)
      }

      // Don't send error details in production for security
      if (process.env.NODE_ENV === 'production' && statusCode >= 500) {
        errorResponse.message = 'Internal Server Error'
        delete errorResponse.stack
      }

      // Send error response
      res.status(statusCode).json(errorResponse)
    }
  }

  // Handle 404 errors (not found)
  notFoundHandler() {
    return (req, res) => {
      const errorResponse = {
        error: true,
        message: 'Route not found',
        statusCode: 404,
        type: 'not_found',
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
      }

      this.logger.warn(this.logPrefix, 'Route not found', {
        path: req.path,
        method: req.method,
        ip: req.ip || req.connection.remoteAddress
      })

      res.status(404).json(errorResponse)
    }
  }
}

// Factory function that creates error handler with logger dependency
export default function createErrorHandler(logger) {
  const errorHandler = new ErrorHandler(logger)
  return errorHandler.middleware()
}