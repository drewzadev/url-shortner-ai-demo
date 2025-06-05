import express from 'express'
import __ from '../libs/attempt.mjs'
import UrlService from '../services/UrlService.js'

/**
 * Factory function that creates web routes with dependencies
 * 
 * @param {Object} database - DatabaseService instance for Prisma operations
 * @param {Object} redis - RedisService instance for caching and short code pool
 * @param {Object} logger - Winston logger instance for operational logging
 * @returns {express.Router} Configured Express router with web routes
 */
export default function createWebRoutes(database, redis, logger) {
  const router = express.Router()
  const logPrefix = 'WebRoutes'
  
  // Initialize URL service with dependencies
  const urlService = new UrlService(database, redis, logger)

  /**
   * Database health check endpoint
   */
  router.get('/health/db', async (req, res, next) => {
    try {
      logger.info(logPrefix, 'Database health check request received')
      
      const [healthError, isHealthy] = await __(database.healthCheck())
      
      if (healthError || !isHealthy) {
        return res.status(503).json({
          status: 'unhealthy',
          database: 'disconnected',
          error: healthError?.message || 'Database health check failed',
          timestamp: new Date().toISOString()
        })
      }
      
      res.json({
        status: 'healthy',
        database: 'connected',
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      next(error)
    }
  })

  /**
   * Main home page route - renders index.ejs with initial URL data
   * Task 1.1: Implement main home page route (GET /) to render index.ejs with initial URL data
   */
  router.get('/', async (req, res, next) => {
    try {
      logger.info(logPrefix, 'Home page request received')
      
      // Get initial URL data for the page
      const [urlsError, urls] = await __(urlService.getAllUrls())
      
      if (urlsError) {
        logger.error(logPrefix, 'Failed to fetch URLs for home page', urlsError)
        // Render page with empty URLs array and error message
        return res.render('index', {
          urls: [],
          error: 'Failed to load URLs. Please refresh the page.',
          success: null
        })
      }
      
      logger.debug(logPrefix, 'Successfully fetched URLs for home page', { count: urls.length })
      
      res.render('index', {
        urls: urls || [],
        error: null,
        success: null
      })
    } catch (error) {
      logger.error(logPrefix, 'Error rendering home page', error)
      next(error)
    }
  })

  /**
   * AJAX endpoint for URL creation
   * Task 1.2: Create AJAX endpoint for URL creation (POST /api/web/create) with JSON response
   */
  router.post('/api/web/create', async (req, res, next) => {
    try {
      const { url } = req.body
      logger.info(logPrefix, 'AJAX URL creation request received', { url })
      
      // Validate input
      if (!url || typeof url !== 'string' || url.trim() === '') {
        logger.warn(logPrefix, 'Invalid URL provided for creation', { url })
        return res.status(400).json({
          success: false,
          error: 'URL is required and must be a valid string',
          data: null
        })
      }
      
      // Create short URL using URL service
      const [createError, shortUrl] = await __(urlService.createShortUrl(url.trim()))
      
      if (createError) {
        logger.error(logPrefix, 'Failed to create short URL via AJAX', createError)
        return res.status(400).json({
          success: false,
          error: createError.message || 'Failed to create short URL',
          data: null
        })
      }
      
      logger.info(logPrefix, 'Successfully created short URL via AJAX', {
        shortCode: shortUrl.shortCode,
        originalUrl: shortUrl.originalUrl
      })
      
      res.json({
        success: true,
        error: null,
        data: {
          id: shortUrl.id,
          originalUrl: shortUrl.originalUrl,
          shortCode: shortUrl.shortCode,
          shortUrl: shortUrl.shortUrl,
          createdAt: shortUrl.createdAt,
          expiresAt: shortUrl.expiresAt,
          clickCount: shortUrl.clickCount
        }
      })
    } catch (error) {
      logger.error(logPrefix, 'Error in AJAX URL creation', error)
      next(error)
    }
  })

  /**
   * AJAX endpoint for URL deletion
   * Task 1.3: Create AJAX endpoint for URL deletion (DELETE /api/web/delete/:shortCode) with JSON response
   */
  router.delete('/api/web/delete/:shortCode', async (req, res, next) => {
    try {
      const { shortCode } = req.params
      logger.info(logPrefix, 'AJAX URL deletion request received', { shortCode })
      
      // Validate short code
      if (!shortCode || typeof shortCode !== 'string' || shortCode.trim() === '') {
        logger.warn(logPrefix, 'Invalid short code provided for deletion', { shortCode })
        return res.status(400).json({
          success: false,
          error: 'Short code is required',
          data: null
        })
      }
      
      // Delete URL using URL service
      const [deleteError, deletedUrl] = await __(urlService.deleteUrl(shortCode.trim()))
      
      if (deleteError) {
        logger.error(logPrefix, 'Failed to delete URL via AJAX', deleteError)
        return res.status(404).json({
          success: false,
          error: deleteError.message || 'Failed to delete URL',
          data: null
        })
      }
      
      logger.info(logPrefix, 'Successfully deleted URL via AJAX', {
        shortCode: deletedUrl.shortCode,
        originalUrl: deletedUrl.originalUrl
      })
      
      res.json({
        success: true,
        error: null,
        data: {
          shortCode: deletedUrl.shortCode,
          originalUrl: deletedUrl.originalUrl
        }
      })
    } catch (error) {
      logger.error(logPrefix, 'Error in AJAX URL deletion', error)
      next(error)
    }
  })

  /**
   * AJAX endpoint for URL listing with pagination for infinite scroll
   * Task 1.4: Create AJAX endpoint for URL listing with pagination (GET /api/web/urls) for infinite scroll
   */
  router.get('/api/web/urls', async (req, res, next) => {
    try {
      const page = parseInt(req.query.page) || 1
      const limit = parseInt(req.query.limit) || 20
      const offset = (page - 1) * limit
      
      logger.info(logPrefix, 'AJAX URL listing request received', { page, limit, offset })
      
      // Validate pagination parameters
      if (page < 1 || limit < 1 || limit > 100) {
        logger.warn(logPrefix, 'Invalid pagination parameters', { page, limit })
        return res.status(400).json({
          success: false,
          error: 'Invalid pagination parameters. Page must be >= 1, limit must be 1-100',
          data: null
        })
      }
      
      // Get all URLs first (we'll implement pagination logic here)
      const [urlsError, allUrls] = await __(urlService.getAllUrls())
      
      if (urlsError) {
        logger.error(logPrefix, 'Failed to fetch URLs for AJAX listing', urlsError)
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch URLs',
          data: null
        })
      }
      
      // Apply pagination
      const totalUrls = allUrls.length
      const paginatedUrls = allUrls.slice(offset, offset + limit)
      const hasMore = offset + limit < totalUrls
      
      logger.debug(logPrefix, 'Successfully fetched paginated URLs', {
        page,
        limit,
        totalUrls,
        returnedUrls: paginatedUrls.length,
        hasMore
      })
      
      res.json({
        success: true,
        error: null,
        data: {
          urls: paginatedUrls,
          pagination: {
            page,
            limit,
            total: totalUrls,
            hasMore,
            totalPages: Math.ceil(totalUrls / limit)
          }
        }
      })
    } catch (error) {
      logger.error(logPrefix, 'Error in AJAX URL listing', error)
      next(error)
    }
  })

  /**
   * Short URL redirect route with asynchronous click tracking
   * Task 1.5: Implement short URL redirect route (GET /:shortCode) with asynchronous click tracking
   */
  router.get('/:shortCode', async (req, res, next) => {
    try {
      const { shortCode } = req.params
      logger.info(logPrefix, 'Short URL redirect request received', { shortCode })
      
      // Validate short code
      if (!shortCode || typeof shortCode !== 'string' || shortCode.trim() === '') {
        logger.warn(logPrefix, 'Invalid short code for redirect', { shortCode })
        return res.status(404).render('errors/404', {
          shortCode,
          message: 'Invalid short code provided'
        })
      }
      
      // Get URL by short code
      const [getUrlError, urlData] = await __(urlService.getUrlByShortCode(shortCode.trim()))
      
      if (getUrlError) {
        logger.warn(logPrefix, 'Short code not found for redirect', { shortCode, error: getUrlError.message })
        return res.status(404).render('errors/404', {
          shortCode,
          message: 'Short URL not found'
        })
      }
      
      // Check if URL is expired
      if (urlData.expiresAt && new Date() > new Date(urlData.expiresAt)) {
        logger.warn(logPrefix, 'Expired URL accessed', { shortCode, expiresAt: urlData.expiresAt })
        return res.status(410).render('errors/expired', {
          shortCode,
          originalUrl: urlData.originalUrl,
          expiresAt: urlData.expiresAt
        })
      }
      
      // Asynchronous click tracking - don't wait for completion
      setImmediate(async () => {
        const [trackError] = await __(urlService.incrementClickCount(shortCode.trim()))
        if (trackError) {
          logger.warn(logPrefix, 'Failed to track click asynchronously', { shortCode, error: trackError.message })
        } else {
          logger.debug(logPrefix, 'Click tracked asynchronously', { shortCode })
        }
      })
      
      logger.info(logPrefix, 'Redirecting to original URL', {
        shortCode,
        originalUrl: urlData.originalUrl
      })
      
      // Redirect to original URL
      res.redirect(302, urlData.originalUrl)
    } catch (error) {
      logger.error(logPrefix, 'Error in short URL redirect', error)
      res.status(500).render('errors/500', {
        shortCode: req.params.shortCode,
        message: 'Internal server error during redirect'
      })
    }
  })

  /**
   * Legacy web form endpoints for backward compatibility
   * These maintain the existing POST routes but redirect to home page
   */
  
  /**
   * Create URL via web form (legacy support)
   */
  router.post('/create', async (req, res, next) => {
    try {
      const { url } = req.body
      logger.info(logPrefix, 'Legacy web form URL creation request received', { url })
      
      if (!url || typeof url !== 'string' || url.trim() === '') {
        return res.redirect('/?error=' + encodeURIComponent('URL is required'))
      }
      
      const [createError, shortUrl] = await __(urlService.createShortUrl(url.trim()))
      
      if (createError) {
        logger.error(logPrefix, 'Failed to create short URL via web form', createError)
        return res.redirect('/?error=' + encodeURIComponent(createError.message || 'Failed to create short URL'))
      }
      
      logger.info(logPrefix, 'Successfully created short URL via web form', {
        shortCode: shortUrl.shortCode
      })
      
      res.redirect('/?success=' + encodeURIComponent('Short URL created successfully'))
    } catch (error) {
      logger.error(logPrefix, 'Error in web form URL creation', error)
      next(error)
    }
  })

  /**
   * Delete URL via web form (legacy support)
   */
  router.post('/delete/:shortCode', async (req, res, next) => {
    try {
      const { shortCode } = req.params
      logger.info(logPrefix, 'Legacy web form URL deletion request received', { shortCode })
      
      if (!shortCode || typeof shortCode !== 'string' || shortCode.trim() === '') {
        return res.redirect('/?error=' + encodeURIComponent('Short code is required'))
      }
      
      const [deleteError] = await __(urlService.deleteUrl(shortCode.trim()))
      
      if (deleteError) {
        logger.error(logPrefix, 'Failed to delete URL via web form', deleteError)
        return res.redirect('/?error=' + encodeURIComponent(deleteError.message || 'Failed to delete URL'))
      }
      
      logger.info(logPrefix, 'Successfully deleted URL via web form', { shortCode })
      
      res.redirect('/?success=' + encodeURIComponent('URL deleted successfully'))
    } catch (error) {
      logger.error(logPrefix, 'Error in web form URL deletion', error)
      next(error)
    }
  })

  return router
}