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
    try {
      logger.info(logPrefix, 'Single URL shortening request received', { 
        body: req.body 
      })
      
      // Validate request body
      const bodyValidation = validateRequestBody(req.body)
      if (bodyValidation) {
        return res.status(bodyValidation.status_code).json(bodyValidation)
      }

      // Validate URL using comprehensive validators utility
      const urlValidation = validateUrl(req.body.url)
      if (!urlValidation.isValid) {
        const errorResponse = createValidationErrorResponse(urlValidation, 'single URL validation')
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
        logger.error(logPrefix, 'Failed to create short URL', { 
          error: error.message,
          originalUrl: req.body.url 
        })
        
        return res.status(400).json(createErrorResponse(
          'URL_CREATION_FAILED',
          error.message,
          [error.message],
          400
        ))
      }

      logger.info(logPrefix, 'Successfully created short URL', { 
        shortCode: result.shortCode,
        originalUrl: result.originalUrl 
      })

      res.status(201).json(createSuccessResponse(
        result,
        'URL shortened successfully',
        201
      ))
    } catch (error) {
      next(error)
    }
  })

  // Bulk URL shortening endpoint
  router.post('/shorten/bulk', async (req, res, next) => {
    try {
      logger.info(logPrefix, 'Bulk URL shortening request received', { 
        urlCount: req.body?.urls?.length 
      })
      
      // Validate request body
      const bodyValidation = validateRequestBody(req.body)
      if (bodyValidation) {
        return res.status(bodyValidation.status_code).json(bodyValidation)
      }

      // Validate request size limits
      const sizeValidation = validateRequestSize(req.body)
      if (!sizeValidation.isValid) {
        const errorResponse = createValidationErrorResponse(sizeValidation, 'request size validation')
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
        logger.error(logPrefix, 'Failed to create bulk short URLs', { 
          error: error.message,
          urlCount: req.body.urls.length 
        })
        
        return res.status(400).json(createErrorResponse(
          'BULK_URL_CREATION_FAILED',
          error.message,
          [error.message],
          400
        ))
      }

      logger.info(logPrefix, 'Successfully created bulk short URLs', { 
        successCount: result.successCount,
        failureCount: result.failureCount 
      })

      res.status(201).json(createSuccessResponse(
        result,
        `Successfully processed ${result.successCount} URLs`,
        201
      ))
    } catch (error) {
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

  return router
}