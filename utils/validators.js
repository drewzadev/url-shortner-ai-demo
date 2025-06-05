import { appConfig } from '../config/app.js'

/**
 * URL Validation Utilities
 * 
 * Provides comprehensive URL validation functionality for the URL shortener service.
 * Includes basic format validation, protocol checks, length limits, and bulk validation.
 */

/**
 * Validate a single URL for basic correctness
 * 
 * @param {string} url - URL to validate
 * @param {Object} options - Validation options
 * @param {number} options.maxLength - Maximum allowed URL length
 * @param {number} options.minLength - Minimum allowed URL length
 * @param {Array<string>} options.allowedProtocols - Allowed URL protocols
 * @param {boolean} options.allowLocalhost - Allow URLs pointing to localhost
 * @param {boolean} options.allowIpAddresses - Allow URLs pointing to IP addresses
 * @returns {Object} Validation result with isValid boolean and error details
 */
export const validateUrl = (url, options = {}) => {
  const {
    maxLength = appConfig.url?.maxLength || 2048,
    minLength = appConfig.url?.minLength || 10,
    allowedProtocols = appConfig.url?.allowedProtocols || ['http:', 'https:'],
    allowLocalhost = appConfig.url?.allowLocalhost || false,
    allowIpAddresses = appConfig.url?.allowIpAddresses || false
  } = options

  // Check if URL is provided and is a string
  if (!url || typeof url !== 'string') {
    return {
      isValid: false,
      error: 'URL is required and must be a string',
      details: ['URL parameter is missing or not a string type']
    }
  }

  // Check URL length
  if (url.length > maxLength) {
    return {
      isValid: false,
      error: `URL exceeds maximum length of ${maxLength} characters`,
      details: [`URL length: ${url.length}, maximum allowed: ${maxLength}`]
    }
  }

  // Check for minimum reasonable URL length
  if (url.length < minLength) {
    return {
      isValid: false,
      error: `URL is too short to be valid (minimum ${minLength} characters)`,
      details: [`URL must be at least ${minLength} characters long`]
    }
  }

  try {
    // Attempt to parse URL using URL constructor
    const urlObj = new URL(url)
    
    // Check for supported protocols
    if (!allowedProtocols.includes(urlObj.protocol)) {
      return {
        isValid: false,
        error: `URL must use one of the allowed protocols: ${allowedProtocols.join(', ')}`,
        details: [`Found protocol: ${urlObj.protocol}, allowed: ${allowedProtocols.join(', ')}`]
      }
    }

    // Check for valid hostname
    if (!urlObj.hostname) {
      return {
        isValid: false,
        error: 'URL must have a valid hostname',
        details: ['URL hostname is missing or invalid']
      }
    }

    // Check for localhost restrictions
    if (!allowLocalhost && urlObj.hostname === 'localhost') {
      return {
        isValid: false,
        error: 'URLs pointing to localhost are not allowed',
        details: [`Hostname 'localhost' is not allowed`]
      }
    }

    // Check for IP address restrictions
    if (!allowIpAddresses && /^\d+\.\d+\.\d+\.\d+$/.test(urlObj.hostname)) {
      return {
        isValid: false,
        error: 'URLs pointing to IP addresses are not allowed',
        details: [`IP address '${urlObj.hostname}' is not allowed`]
      }
    }

    // Check for potentially dangerous protocols in the URL content
    const dangerousPatterns = [
      /javascript:/i,
      /data:/i,
      /vbscript:/i,
      /file:/i
    ]

    for (const pattern of dangerousPatterns) {
      if (pattern.test(url)) {
        return {
          isValid: false,
          error: 'URL contains potentially dangerous content',
          details: ['URL contains disallowed protocol or content patterns']
        }
      }
    }

    return { 
      isValid: true,
      parsedUrl: urlObj
    }
  } catch (error) {
    return {
      isValid: false,
      error: 'Invalid URL format',
      details: [`URL parsing failed: ${error.message}`]
    }
  }
}

/**
 * Validate URL length against configured limits
 * 
 * @param {string} url - URL to validate
 * @param {number} maxLength - Maximum allowed length (optional, uses config default)
 * @returns {Object} Validation result
 */
export const validateUrlLength = (url, maxLength) => {
  const limit = maxLength || appConfig.url?.maxLength || 2048

  if (!url || typeof url !== 'string') {
    return {
      isValid: false,
      error: 'URL must be a string',
      details: ['URL parameter is not a valid string']
    }
  }

  if (url.length > limit) {
    return {
      isValid: false,
      error: `URL exceeds maximum length of ${limit} characters`,
      details: [`URL length: ${url.length}, maximum allowed: ${limit}`]
    }
  }

  return { isValid: true }
}

/**
 * Validate an array of URLs for bulk operations
 * 
 * @param {Array} urls - Array of URLs to validate
 * @param {Object} options - Validation options
 * @param {number} options.maxCount - Maximum number of URLs allowed in bulk operation
 * @param {number} options.maxLength - Maximum length for individual URLs
 * @returns {Object} Validation result with details about failures
 */
export const validateBulkUrls = (urls, options = {}) => {
  const {
    maxCount = appConfig.url?.bulkOperationLimit || 1000,
    maxLength = appConfig.url?.maxLength || 2048
  } = options

  // Check if URLs parameter is an array
  if (!Array.isArray(urls)) {
    return {
      isValid: false,
      error: 'URLs must be provided as an array',
      details: ['urls parameter must be an array'],
      failedUrls: []
    }
  }

  // Check for empty array
  if (urls.length === 0) {
    return {
      isValid: false,
      error: 'URLs array cannot be empty',
      details: ['At least one URL must be provided'],
      failedUrls: []
    }
  }

  // Check bulk operation limit
  if (urls.length > maxCount) {
    return {
      isValid: false,
      error: `Bulk operations are limited to ${maxCount} URLs`,
      details: [`Provided ${urls.length} URLs, maximum allowed is ${maxCount}`],
      failedUrls: []
    }
  }

  // Validate each URL in the array
  const failedUrls = []
  const validationErrors = []

  urls.forEach((url, index) => {
    const validation = validateUrl(url, { maxLength })
    
    if (!validation.isValid) {
      failedUrls.push({
        index,
        url,
        error: validation.error,
        details: validation.details
      })
      validationErrors.push(`URL at index ${index}: ${validation.error}`)
    }
  })

  // Check for any validation failures
  if (failedUrls.length > 0) {
    return {
      isValid: false,
      error: `${failedUrls.length} URLs failed validation`,
      details: validationErrors,
      failedUrls,
      validCount: urls.length - failedUrls.length,
      totalCount: urls.length
    }
  }

  return { 
    isValid: true,
    validCount: urls.length,
    totalCount: urls.length,
    failedUrls: []
  }
}

/**
 * Validate request size limits for API endpoints
 * 
 * @param {Object} requestBody - Request body to validate
 * @param {Object} limits - Size limits configuration
 * @param {number} limits.maxUrlCount - Maximum number of URLs in bulk operations
 * @param {number} limits.maxBodySize - Maximum request body size in bytes (optional)
 * @returns {Object} Validation result
 */
export const validateRequestSize = (requestBody, limits = {}) => {
  const {
    maxUrlCount = appConfig.url?.bulkOperationLimit || 1000,
    maxBodySize = appConfig.validation?.maxRequestBodySize || 10 * 1024 * 1024 // 10MB default
  } = limits

  if (!requestBody || typeof requestBody !== 'object') {
    return {
      isValid: false,
      error: 'Request body must be a valid object',
      details: ['Request body is missing or not an object']
    }
  }

  // Check for bulk URL operations
  if (requestBody.urls && Array.isArray(requestBody.urls)) {
    if (requestBody.urls.length > maxUrlCount) {
      return {
        isValid: false,
        error: `Bulk operations are limited to ${maxUrlCount} URLs`,
        details: [`Provided ${requestBody.urls.length} URLs, maximum allowed is ${maxUrlCount}`]
      }
    }
  }

  // Check request body size if maxBodySize is specified
  if (maxBodySize) {
    try {
      const bodySize = JSON.stringify(requestBody).length
      if (bodySize > maxBodySize) {
        return {
          isValid: false,
          error: 'Request body exceeds maximum size limit',
          details: [`Request size: ${Math.round(bodySize / 1024)} KB, maximum allowed: ${Math.round(maxBodySize / 1024)} KB`]
        }
      }
    } catch (error) {
      return {
        isValid: false,
        error: 'Unable to calculate request body size',
        details: ['Request body serialization failed']
      }
    }
  }

  return { isValid: true }
}

/**
 * Create detailed error messages for validation failures
 * 
 * @param {Object} validationResult - Result from validation function
 * @param {string} context - Context for the validation (e.g., 'single URL', 'bulk URLs')
 * @returns {Object} Formatted error response with details array
 */
export const createValidationErrorResponse = (validationResult, context = 'URL validation') => {
  if (validationResult.isValid) {
    return null
  }

  const maxDetails = appConfig.validation?.maxErrorDetailsCount || 5
  const details = validationResult.details || [validationResult.error]
  
  // Add additional context for bulk validation failures
  if (validationResult.failedUrls && validationResult.failedUrls.length > 0) {
    details.push(`Failed URLs: ${validationResult.failedUrls.length}/${validationResult.totalCount}`)
    
    // Include specific failures for debugging (limited by configuration)
    validationResult.failedUrls.slice(0, maxDetails).forEach(failure => {
      details.push(`Index ${failure.index}: ${failure.error}`)
    })
    
    if (validationResult.failedUrls.length > maxDetails) {
      details.push(`... and ${validationResult.failedUrls.length - maxDetails} more failures`)
    }
  }

  // Limit total details array length
  const limitedDetails = details.slice(0, maxDetails * 2) // Allow more details for bulk operations
  if (details.length > limitedDetails.length) {
    limitedDetails.push(`... and ${details.length - limitedDetails.length} more details`)
  }

  return {
    error: validationResult.error,
    details: limitedDetails,
    context
  }
}

/**
 * Validate short code format
 * 
 * @param {string} shortCode - Short code to validate
 * @returns {Object} Validation result
 */
export const validateShortCode = (shortCode) => {
  if (!shortCode || typeof shortCode !== 'string') {
    return {
      isValid: false,
      error: 'Short code is required and must be a string',
      details: ['shortCode parameter is missing or invalid']
    }
  }

  // Check short code length (should match configured length)
  const expectedLength = appConfig.shortCode?.length || 5
  if (shortCode.length !== expectedLength) {
    return {
      isValid: false,
      error: `Short code must be exactly ${expectedLength} characters`,
      details: [`Provided length: ${shortCode.length}, expected: ${expectedLength}`]
    }
  }

  // Check short code character set
  const allowedChars = appConfig.shortCode?.charset || 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const regex = new RegExp(`^[${allowedChars.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}]+$`)
  
  if (!regex.test(shortCode)) {
    return {
      isValid: false,
      error: 'Short code contains invalid characters',
      details: [`Short code must only contain characters from: ${allowedChars}`]
    }
  }

  return { isValid: true }
} 