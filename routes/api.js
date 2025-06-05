import express from 'express'
import UrlService from '../services/UrlService.js'
import __ from '../libs/attempt.mjs'
import { 
  validateUrl, 
  validateBulkUrls, 
  validateShortCode, 
  validateRequestSize,
  createValidationErrorResponse 
} from '../utils/validators.js'

// Factory function that creates API routes with dependencies
export default function createApiRoutes(database, redis, logger) {
  const router = express.Router()
  const logPrefix = 'ApiRoutes'
  
  // Instantiate UrlService with proper dependencies
  const urlService = new UrlService(database, redis, logger)

  /**
   * Standardized success response format
   * @param {Object} data - Response data
   * @param {string} message - Success message
   * @param {number} statusCode - HTTP status code
   * @returns {Object} Formatted success response
   */
  const createSuccessResponse = (data, message = 'Success', statusCode = 200) => {
    return {
      success: true,
      status_code: statusCode,
      message,
      data
    }
  }

  /**
   * Standardized error response format
   * @param {string} code - Error code
   * @param {string} message - Error message
   * @param {Array} details - Error details array
   * @param {number} statusCode - HTTP status code
   * @returns {Object} Formatted error response
   */
  const createErrorResponse = (code, message, details = [], statusCode = 400) => {
    return {
      success: false,
      status_code: statusCode,
      error: {
        code,
        message,
        details
      }
    }
  }

  /**
   * Validate request body exists and is not empty
   * @param {Object} body - Request body
   * @returns {Object|null} Validation error or null if valid
   */
  const validateRequestBody = (body) => {
    if (!body || Object.keys(body).length === 0) {
      return createErrorResponse(
        'INVALID_REQUEST_BODY',
        'Request body is required',
        ['Request body cannot be empty'],
        400
      )
    }
    return null
  }

  // Single URL shortening endpoint
  router.post('/shorten', async (req, res, next) => {
    const requestId = Math.random().toString(36).substring(7)
    const startTime = Date.now()
    
    try {
      logger.info(logPrefix, 'Single URL shortening request received', { 
        requestId,
        body: req.body,
        userAgent: req.headers['user-agent'],
        ip: req.ip
      })
      
      // Validate request body
      const bodyValidation = validateRequestBody(req.body)
      if (bodyValidation) {
        logger.warn(logPrefix, 'Request body validation failed', {
          requestId,
          error: bodyValidation.error,
          body: req.body
        })
        return res.status(bodyValidation.status_code).json(bodyValidation)
      }

      // Validate URL using comprehensive validators utility
      const urlValidation = validateUrl(req.body.url)
      if (!urlValidation.isValid) {
        const errorResponse = createValidationErrorResponse(urlValidation, 'single URL validation')
        logger.warn(logPrefix, 'URL validation failed', {
          requestId,
          url: req.body.url,
          validation: urlValidation
        })
        return res.status(400).json(createErrorResponse(
          'INVALID_URL',
          errorResponse.error,
          errorResponse.details,
          400
        ))
      }

      // Create short URL using UrlService
      const [error, result] = await __(urlService.createShortUrl(req.body.url))
      
      if (error) {
        const responseTime = Date.now() - startTime
        logger.error(logPrefix, 'Failed to create short URL', { 
          requestId,
          error: error.message,
          originalUrl: req.body.url,
          responseTime,
          errorType: _categorizeError(error)
        })
        
        // Determine appropriate status code based on error type
        const statusCode = _getStatusCodeForError(error)
        
        return res.status(statusCode).json(createErrorResponse(
          'URL_CREATION_FAILED',
          error.message,
          [error.message],
          statusCode
        ))
      }

      const responseTime = Date.now() - startTime
      logger.info(logPrefix, 'Successfully created short URL', { 
        requestId,
        shortCode: result.shortCode,
        originalUrl: result.originalUrl,
        responseTime
      })

      res.status(201).json(createSuccessResponse(
        result,
        'URL shortened successfully',
        201
      ))
    } catch (error) {
      const responseTime = Date.now() - startTime
      logger.error(logPrefix, 'Unexpected error in URL shortening', {
        requestId,
        error: error.message,
        stack: error.stack,
        responseTime
      })
      next(error)
    }
  })

  // Bulk URL shortening endpoint
  router.post('/shorten/bulk', async (req, res, next) => {
    const requestId = Math.random().toString(36).substring(7)
    const startTime = Date.now()
    
    try {
      logger.info(logPrefix, 'Bulk URL shortening request received', { 
        requestId,
        urlCount: req.body?.urls?.length,
        userAgent: req.headers['user-agent'],
        ip: req.ip
      })
      
      // Validate request body
      const bodyValidation = validateRequestBody(req.body)
      if (bodyValidation) {
        logger.warn(logPrefix, 'Bulk request body validation failed', {
          requestId,
          error: bodyValidation.error,
          bodyKeys: Object.keys(req.body || {})
        })
        return res.status(bodyValidation.status_code).json(bodyValidation)
      }

      // Validate request size limits
      const sizeValidation = validateRequestSize(req.body)
      if (!sizeValidation.isValid) {
        const errorResponse = createValidationErrorResponse(sizeValidation, 'request size validation')
        logger.warn(logPrefix, 'Bulk request size validation failed', {
          requestId,
          urlCount: req.body?.urls?.length,
          validation: sizeValidation
        })
        return res.status(400).json(createErrorResponse(
          'REQUEST_SIZE_EXCEEDED',
          errorResponse.error,
          errorResponse.details,
          400
        ))
      }

      // Validate URLs array using comprehensive validator
      const urlsValidation = validateBulkUrls(req.body.urls)
      if (!urlsValidation.isValid) {
        const errorResponse = createValidationErrorResponse(urlsValidation, 'bulk URLs validation')
        logger.warn(logPrefix, 'Bulk URLs validation failed', {
          requestId,
          urlCount: req.body.urls?.length,
          validation: urlsValidation
        })
        return res.status(400).json(createErrorResponse(
          'BULK_URL_VALIDATION_FAILED',
          errorResponse.error,
          errorResponse.details,
          400
        ))
      }

      // Create bulk short URLs using UrlService
      const [error, result] = await __(urlService.createBulkShortUrls(req.body.urls))
      
      if (error) {
        const responseTime = Date.now() - startTime
        logger.error(logPrefix, 'Failed to create bulk short URLs', { 
          requestId,
          error: error.message,
          urlCount: req.body.urls.length,
          responseTime,
          errorType: _categorizeError(error)
        })
        
        // Determine appropriate status code based on error type
        const statusCode = _getStatusCodeForError(error)
        
        return res.status(statusCode).json(createErrorResponse(
          'BULK_URL_CREATION_FAILED',
          error.message,
          [error.message],
          statusCode
        ))
      }

      const responseTime = Date.now() - startTime
      logger.info(logPrefix, 'Successfully created bulk short URLs', { 
        requestId,
        successCount: result.successCount,
        failureCount: result.failureCount,
        responseTime
      })

      res.status(201).json(createSuccessResponse(
        result,
        `Successfully processed ${result.successCount} URLs`,
        201
      ))
    } catch (error) {
      const responseTime = Date.now() - startTime
      logger.error(logPrefix, 'Unexpected error in bulk URL shortening', {
        requestId,
        error: error.message,
        stack: error.stack,
        urlCount: req.body?.urls?.length,
        responseTime
      })
      next(error)
    }
  })

  // Get URL details endpoint
  router.get('/url/:shortCode', async (req, res, next) => {
    try {
      const { shortCode } = req.params
      
      logger.info(logPrefix, 'URL details request received', { shortCode })
      
      // Validate shortCode parameter using comprehensive validator
      const shortCodeValidation = validateShortCode(shortCode)
      if (!shortCodeValidation.isValid) {
        const errorResponse = createValidationErrorResponse(shortCodeValidation, 'short code validation')
        return res.status(400).json(createErrorResponse(
          'INVALID_SHORT_CODE',
          errorResponse.error,
          errorResponse.details,
          400
        ))
      }

      // Get URL details using UrlService
      const [error, result] = await __(urlService.getUrlByShortCode(shortCode))
      
      if (error) {
        logger.error(logPrefix, 'Failed to retrieve URL details', { 
          error: error.message,
          shortCode 
        })
        
        // Check if it's a not found error
        if (error.message.includes('not found') || error.message.includes('does not exist')) {
          return res.status(404).json(createErrorResponse(
            'URL_NOT_FOUND',
            'URL not found',
            [`URL with short code '${shortCode}' does not exist`],
            404
          ))
        }
        
        return res.status(500).json(createErrorResponse(
          'URL_RETRIEVAL_FAILED',
          'Failed to retrieve URL details',
          [error.message],
          500
        ))
      }

      // Check if URL was found
      if (!result) {
        return res.status(404).json(createErrorResponse(
          'URL_NOT_FOUND',
          'URL not found',
          [`URL with short code '${shortCode}' does not exist`],
          404
        ))
      }

      logger.info(logPrefix, 'Successfully retrieved URL details', { 
        shortCode,
        originalUrl: result.originalUrl 
      })

      res.status(200).json(createSuccessResponse(
        result,
        'URL details retrieved successfully',
        200
      ))
    } catch (error) {
      next(error)
    }
  })

  // Delete URL endpoint
  router.delete('/url/:shortCode', async (req, res, next) => {
    try {
      const { shortCode } = req.params
      
      logger.info(logPrefix, 'URL deletion request received', { shortCode })
      
      // Validate shortCode parameter using comprehensive validator
      const shortCodeValidation = validateShortCode(shortCode)
      if (!shortCodeValidation.isValid) {
        const errorResponse = createValidationErrorResponse(shortCodeValidation, 'short code validation')
        return res.status(400).json(createErrorResponse(
          'INVALID_SHORT_CODE',
          errorResponse.error,
          errorResponse.details,
          400
        ))
      }

      // Delete URL using UrlService
      const [error, result] = await __(urlService.deleteUrl(shortCode))
      
      if (error) {
        logger.error(logPrefix, 'Failed to delete URL', { 
          error: error.message,
          shortCode 
        })
        
        // Check if it's a not found error
        if (error.message.includes('not found') || error.message.includes('does not exist')) {
          return res.status(404).json(createErrorResponse(
            'URL_NOT_FOUND',
            'URL not found',
            [`URL with short code '${shortCode}' does not exist`],
            404
          ))
        }
        
        return res.status(500).json(createErrorResponse(
          'URL_DELETION_FAILED',
          'Failed to delete URL',
          [error.message],
          500
        ))
      }

      logger.info(logPrefix, 'Successfully deleted URL', { 
        shortCode,
        deletedUrl: result.originalUrl 
      })

      res.status(200).json(createSuccessResponse(
        result,
        'URL deleted successfully',
        200
      ))
    } catch (error) {
      next(error)
    }
  })

  // Get all URLs endpoint
  router.get('/urls', async (req, res, next) => {
    try {
      logger.info(logPrefix, 'All URLs request received')
      
      // Get all URLs using UrlService
      const [error, result] = await __(urlService.getAllUrls())
      
      if (error) {
        logger.error(logPrefix, 'Failed to retrieve all URLs', { 
          error: error.message 
        })
        
        return res.status(500).json(createErrorResponse(
          'URL_LIST_RETRIEVAL_FAILED',
          'Failed to retrieve URL list',
          [error.message],
          500
        ))
      }

      logger.info(logPrefix, 'Successfully retrieved all URLs', { 
        count: result.length 
      })

      res.status(200).json(createSuccessResponse(
        result,
        `Retrieved ${result.length} URLs`,
        200
      ))
    } catch (error) {
      next(error)
    }
  })

  /**
   * Categorize error types for better logging and monitoring
   * @param {Error} error - The error object
   * @returns {string} Error category
   */
  const _categorizeError = (error) => {
    const message = error.message?.toLowerCase() || ''
    
    if (message.includes('database service unavailable') || 
        message.includes('database connection') ||
        message.includes('database health check failed')) {
      return 'database_unavailable'
    }
    
    if (message.includes('redis') || 
        message.includes('cache')) {
      return 'redis_error'
    }
    
    if (message.includes('validation') || 
        message.includes('invalid')) {
      return 'validation_error'
    }
    
    if (message.includes('not found') || 
        message.includes('does not exist')) {
      return 'not_found'
    }
    
    if (message.includes('collision') || 
        message.includes('unique constraint')) {
      return 'constraint_violation'
    }
    
    return 'unknown_error'
  }

  /**
   * Determine appropriate HTTP status code based on error type
   * @param {Error} error - The error object
   * @returns {number} HTTP status code
   */
  const _getStatusCodeForError = (error) => {
    const errorType = _categorizeError(error)
    
    switch (errorType) {
      case 'database_unavailable':
        return 503 // Service Unavailable
      case 'validation_error':
        return 400 // Bad Request
      case 'not_found':
        return 404 // Not Found
      case 'constraint_violation':
        return 409 // Conflict
      case 'redis_error':
        return 500 // Internal Server Error (but operation can continue)
      default:
        return 500 // Internal Server Error
    }
  }

  return router
}