import express from 'express'
import logger from '../config/logger.js'
import databaseService from '../config/database.js'
import __ from '../libs/attempt.mjs'

const router = express.Router()
const logPrefix = 'WebRoutes'

// Database health check endpoint
router.get('/health/db', async (req, res, next) => {
  try {
    logger.info(logPrefix, 'Database health check request received')
    
    const [healthError, isHealthy] = await __(databaseService.healthCheck())
    
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

// Home page with URL creation form
router.get('/', async (req, res, next) => {
  try {
    logger.info(logPrefix, 'Home page request received')
    
    // TODO: Render home page with URL creation form
    res.status(501).send(`
      <html>
        <head><title>URL Shortener - Not Implemented</title></head>
        <body>
          <h1>URL Shortener Service</h1>
          <p>Home page with URL creation form not yet implemented</p>
          <p>Status: 501 - Not Implemented</p>
        </body>
      </html>
    `)
  } catch (error) {
    next(error)
  }
})

// URL listing page
router.get('/list', async (req, res, next) => {
  try {
    logger.info(logPrefix, 'URL listing page request received')
    
    // TODO: Render URL listing page
    res.status(501).send(`
      <html>
        <head><title>URL List - Not Implemented</title></head>
        <body>
          <h1>URL List</h1>
          <p>URL listing page not yet implemented</p>
          <p>Status: 501 - Not Implemented</p>
        </body>
      </html>
    `)
  } catch (error) {
    next(error)
  }
})

// Create URL via web form
router.post('/create', async (req, res, next) => {
  try {
    logger.info(logPrefix, 'Web URL creation request received')
    
    // TODO: Implement web-based URL creation
    res.status(501).send(`
      <html>
        <head><title>URL Creation - Not Implemented</title></head>
        <body>
          <h1>URL Creation</h1>
          <p>Web-based URL creation not yet implemented</p>
          <p>Status: 501 - Not Implemented</p>
        </body>
      </html>
    `)
  } catch (error) {
    next(error)
  }
})

// Delete URL via web interface
router.post('/delete/:shortCode', async (req, res, next) => {
  try {
    logger.info(logPrefix, 'Web URL deletion request received', { shortCode: req.params.shortCode })
    
    // TODO: Implement web-based URL deletion
    res.status(501).send(`
      <html>
        <head><title>URL Deletion - Not Implemented</title></head>
        <body>
          <h1>URL Deletion</h1>
          <p>Web-based URL deletion not yet implemented</p>
          <p>Status: 501 - Not Implemented</p>
        </body>
      </html>
    `)
  } catch (error) {
    next(error)
  }
})

// Short URL redirect route - this is the main functionality
router.get('/:shortCode', async (req, res, next) => {
  try {
    const { shortCode } = req.params
    logger.info(logPrefix, 'Short URL redirect request received', { shortCode })
    
    // TODO: Implement short URL redirect logic
    res.status(501).send(`
      <html>
        <head><title>Redirect - Not Implemented</title></head>
        <body>
          <h1>URL Redirect</h1>
          <p>Short URL redirect for "${shortCode}" not yet implemented</p>
          <p>Status: 501 - Not Implemented</p>
        </body>
      </html>
    `)
  } catch (error) {
    next(error)
  }
})

export default router