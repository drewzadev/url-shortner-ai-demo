import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import __ from './libs/attempt.mjs'
import { createCoreServices, shutdownCoreServices } from './libs/bootstrap.js'
import { appConfig } from './config/app.js'

// Services imports
import ShortCodePoolService from './services/ShortCodePoolService.js'
import ShortCodePoolMonitor from './utils/ShortCodePoolMonitor.js'

// Route and middleware factory imports
import createApiRoutes from './routes/api.js'
import createWebRoutes from './routes/web.js'
import createLoggingMiddleware from './middleware/logging.js'
import createErrorHandler from './middleware/errorHandler.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

class UrlShortenerServer {
  constructor() {
    this.app = express()
    this.server = null
    this.port = appConfig.server.port
    this.logPrefix = 'UrlShortenerServer'
    
    // Dependencies - will be initialized in start()
    this.logger = null
    this.database = null
    this.redis = null
    this.poolService = null
    this.poolMonitor = null
    
    // Setup basic middleware first (doesn't need dependencies)
    this._setupBasicMiddleware()
  }

  _setupBasicMiddleware() {
    // Basic Express setup that doesn't need dependencies
    if (appConfig.server.trustProxy) {
      this.app.set('trust proxy', true)
    }
    
    this.app.set('view engine', 'ejs')
    this.app.set('views', path.join(__dirname, 'views'))
    this.app.use(express.static(path.join(__dirname, 'public')))
    this.app.use(express.json({ limit: '10mb' }))
    this.app.use(express.urlencoded({ extended: true }))
    
    this.app.use((req, res, next) => {
      req.setTimeout(appConfig.server.requestTimeout)
      next()
    })
  }

  async _initializeDependencies() {
    console.log('UrlShortenerServer: Initializing core dependencies...')
    
    // Create and connect core services - will throw on failure
    const services = await createCoreServices()
    this.logger = services.logger
    this.database = services.database  
    this.redis = services.redis
    
    this.logger.info(this.logPrefix, 'Core dependencies initialized successfully')
  }

  async _initializeApplicationServices() {
    this.logger.info(this.logPrefix, 'Initializing application services...')
    
    // Create application services with dependencies
    this.poolService = new ShortCodePoolService(this.database, this.redis, this.logger)
    this.poolMonitor = new ShortCodePoolMonitor(this.redis, this.logger)
    
    // Set pool service reference in monitor
    this.poolMonitor.setPoolService(this.poolService)
    
    // Initialize services
    await this.poolService.initialize()
    await this.poolMonitor.startMonitoring()
    
    this.logger.info(this.logPrefix, 'Application services initialized successfully')
  }

  _setupMiddleware() {
    // Middleware that needs dependencies
    const loggingMiddleware = createLoggingMiddleware(this.logger)
    this.app.use(loggingMiddleware)
  }

  _setupRoutes() {
    // Health check endpoint with access to dependencies
    this.app.get('/health', async (req, res) => {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '0.0.1',
        services: {
          redis: 'unknown',
          database: 'unknown'
        }
      }
      
      // Check Redis health
      try {
        await this.redis.healthCheck()
        health.services.redis = 'healthy'
        
        // Check pool status
        const poolStatus = await this.poolMonitor.checkPoolLevel()
        health.services.shortCodePool = poolStatus.level
        health.poolSize = poolStatus.poolSize
        health.poolLevel = poolStatus.level
      } catch (error) {
        health.services.redis = 'unhealthy'
        health.services.shortCodePool = 'unhealthy'
      }
      
      // Check Database health
      try {
        await this.database.healthCheck()
        health.services.database = 'healthy'
      } catch (error) {
        health.services.database = 'unhealthy'
      }
      
      // Set overall status
      const hasUnhealthyServices = Object.values(health.services).some(status => status === 'unhealthy')
      if (hasUnhealthyServices) {
        health.status = 'degraded'
        res.status(503)
      }
      
      res.json(health)
    })

    // Application routes with dependencies
    const apiRoutes = createApiRoutes(this.database, this.redis, this.logger)
    const webRoutes = createWebRoutes(this.database, this.redis, this.logger)
    
    this.app.use('/api', apiRoutes)
    this.app.use('/', webRoutes)

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: true,
        message: 'The page you are looking for does not exist.',
        statusCode: 404,
        path: req.originalUrl,
        timestamp: new Date().toISOString()
      })
    })
  }

  _setupErrorHandling() {
    const errorHandler = createErrorHandler(this.logger)
    this.app.use(errorHandler)
  }

  _setupGracefulShutdown() {
    const shutdown = async (signal) => {
      this.logger.info(this.logPrefix, `Received ${signal}. Starting graceful shutdown...`)
      
      if (this.server) {
        this.server.close(async () => {
          this.logger.info(this.logPrefix, 'HTTP server closed')
          
          // Shutdown application services
          if (this.poolMonitor) {
            await this.poolMonitor.stopMonitoring()
          }
          if (this.poolService) {
            await this.poolService.shutdown()
          }
          
          // Shutdown core services
          await shutdownCoreServices({
            logger: this.logger,
            database: this.database,
            redis: this.redis
          })
          
          this.logger.info(this.logPrefix, 'Graceful shutdown completed')
          process.exit(0)
        })
      } else {
        process.exit(0)
      }
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))
  }

  async start() {
    try {
      // Initialize dependencies first - FAIL FAST if any fail
      await this._initializeDependencies()
      
      // Initialize application services
      await this._initializeApplicationServices()
      
      // Setup middleware and routes now that dependencies are ready
      this._setupMiddleware()
      this._setupRoutes()
      this._setupErrorHandling()
      this._setupGracefulShutdown()
      
      // Start server
      this.server = this.app.listen(this.port, () => {
        this.logger.info(this.logPrefix, `Server running on port ${this.port}`)
        this.logger.info(this.logPrefix, `Environment: ${process.env.NODE_ENV || 'development'}`)
        this.logger.info(this.logPrefix, `Base URL: ${appConfig.server.baseUrl || `http://localhost:${this.port}`}`)
      })

      this.server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          this.logger.fatal(this.logPrefix, `Port ${this.port} is already in use`)
        } else {
          this.logger.fatal(this.logPrefix, 'Server error:', error)
        }
        process.exit(1)
      })

    } catch (error) {
      // FAIL FAST: If any dependency initialization fails, exit immediately
      console.error('Failed to start URL Shortener server:', error)
      process.exit(1)
    }
  }
}

// Start the server
const server = new UrlShortenerServer()
const [startupError] = await __(server.start())

if (startupError) {
  console.error('Failed to start URL Shortener server:', startupError)
  process.exit(1)
}