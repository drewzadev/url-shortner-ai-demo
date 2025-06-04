import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import __ from './libs/attempt.mjs'

// Configuration imports
import './config/logger.js'
// Database and Redis will be imported dynamically to avoid startup blocking

// Middleware imports
import loggingMiddleware from './middleware/logging.js'
import errorHandler from './middleware/errorHandler.js'

// Route imports
import apiRoutes from './routes/api.js'
import webRoutes from './routes/web.js'

// Services imports
import RedisService from './services/RedisService.js'
import ShortCodePoolService from './services/ShortCodePoolService.js'
import ShortCodePoolMonitor from './utils/ShortCodePoolMonitor.js'
import logger from './config/logger.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

class UrlShortenerServer {
  constructor() {
    this.app = express()
    this.server = null
    this.port = process.env.PORT || 3000
    this.logPrefix = 'UrlShortenerServer'
    this.logger = logger
    this.poolService = new ShortCodePoolService()
    this.poolMonitor = new ShortCodePoolMonitor()
    
    this._setupMiddleware()
    this._setupRoutes()
    this._setupErrorHandling()
    this._setupGracefulShutdown()
  }

  _setupMiddleware() {
    // Trust proxy settings
    if (process.env.TRUST_PROXY === 'true') {
      this.app.set('trust proxy', true)
    }

    // View engine setup
    this.app.set('view engine', 'ejs')
    this.app.set('views', path.join(__dirname, 'views'))

    // Static files
    this.app.use(express.static(path.join(__dirname, 'public')))

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }))
    this.app.use(express.urlencoded({ extended: true }))

    // Custom middleware
    this.app.use(loggingMiddleware)

    // Request timeout
    this.app.use((req, res, next) => {
      req.setTimeout(parseInt(process.env.REQUEST_TIMEOUT_MS) || 30000)
      next()
    })
  }

  _setupRoutes() {
    // Health check endpoint
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
      
      // Check Redis health and pool status
      try {
        const poolStatus = await this.poolMonitor.checkPoolLevel()
        if (poolStatus.status === 'error') {
          health.services.redis = 'unhealthy'
          health.services.shortCodePool = 'unhealthy'
        } else {
          health.services.redis = 'healthy'
          health.services.shortCodePool = poolStatus.level
          health.poolSize = poolStatus.poolSize
          health.poolLevel = poolStatus.level
        }
      } catch (error) {
        health.services.redis = 'unhealthy'
        health.services.shortCodePool = 'unhealthy'
      }
      
      // Check Database health
      try {
        const databaseService = (await import('./config/database.js')).default
        if (databaseService.isConnected) {
          await databaseService.healthCheck()
          health.services.database = 'healthy'
        } else {
          health.services.database = 'disconnected'
        }
      } catch (error) {
        health.services.database = 'unhealthy'
      }
      
      // Set overall status based on services
      const hasUnhealthyServices = Object.values(health.services).some(status => status === 'unhealthy')
      if (hasUnhealthyServices) {
        health.status = 'degraded'
        res.status(503)
      }
      
      res.json(health)
    })

    // API routes
    this.app.use('/api', apiRoutes)

    // Web interface routes
    this.app.use('/', webRoutes)

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).render('error', {
        title: 'Page Not Found',
        message: 'The page you are looking for does not exist.',
        statusCode: 404
      })
    })
  }

  _setupErrorHandling() {
    this.app.use(errorHandler)
  }

  _setupGracefulShutdown() {
    const shutdown = async (signal) => {
      this.logger.info(this.logPrefix, `Received ${signal}. Starting graceful shutdown...`)
      
      if (this.server) {
        this.server.close(async () => {
          this.logger.info(this.logPrefix, 'HTTP server closed')
          
          // Close database connections
          const [dbError] = await __(this._closeDatabaseConnections())
          if (dbError) {
            this.logger.error(this.logPrefix, 'Error closing database connections:', dbError)
          }
          
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

  async _closeDatabaseConnections() {
    try {
      // Stop pool monitoring
      if (this.poolMonitor) {
        await this.poolMonitor.stopMonitoring()
      }
      
      // Shutdown pool service
      if (this.poolService) {
        await this.poolService.shutdown()
      }
      
      // Close Redis connection
      const redisService = new RedisService()
      await redisService.disconnect()
      
      // Prisma client will be closed in database config
      this.logger.info(this.logPrefix, 'Database connections closed successfully')
    } catch (error) {
      this.logger.error(this.logPrefix, 'Error closing database connections:', error)
      throw error
    }
  }

  async _initializeServicesInBackground() {
    this.logger.info(this.logPrefix, 'Initializing services in background...')
    
    const initResults = {
      redis: false,
      database: false
    }
    
    // Try to initialize Redis with timeout
    const [redisError] = await __(this._initializeRedisWithTimeout())
    if (redisError) {
      this.logger.warn(this.logPrefix, 'Redis service unavailable, continuing without caching:', redisError.message)
      initResults.redis = false
    } else {
      this.logger.info(this.logPrefix, 'Redis service initialized successfully')
      initResults.redis = true
    }
    
    // Try to initialize Database with timeout
    const [dbError] = await __(this._initializeDatabaseWithTimeout())
    if (dbError) {
      this.logger.warn(this.logPrefix, 'Database service unavailable, some features will be limited:', dbError.message)
      initResults.database = false
    } else {
      this.logger.info(this.logPrefix, 'Database service initialized successfully')
      initResults.database = true
    }
    
    this.logger.info(this.logPrefix, 'Background service initialization completed', initResults)
    return initResults
  }

  async _initializeRedisWithTimeout() {
    const timeout = 3000 // 3 second timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Redis connection timeout')), timeout)
    })
    
    const connectPromise = this._initializeRedis()
    
    return Promise.race([connectPromise, timeoutPromise])
  }

  async _initializeDatabaseWithTimeout() {
    const timeout = 3000 // 3 second timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database connection timeout')), timeout)
    })
    
    const connectPromise = this._initializeDatabase()
    
    return Promise.race([connectPromise, timeoutPromise])
  }

  async _initializeRedis() {
    // Initialize the pool service (includes Redis connection and pool setup)
    await this.poolService.initialize()
    
    // Start pool monitoring
    await this.poolMonitor.startMonitoring()
    
    this.logger.info(this.logPrefix, 'Redis and short code pool initialization completed')
  }

  async _initializeDatabase() {
    // Database connection is handled by the singleton in config
    // Just test that it's working
    const databaseService = (await import('./config/database.js')).default
    await databaseService.connect()
    await databaseService.healthCheck()
  }

  async start() {
    try {
      // Start server first, then initialize services in background
      this.server = this.app.listen(this.port, () => {
        this.logger.info(this.logPrefix, `Server running on port ${this.port}`)
        this.logger.info(this.logPrefix, `Environment: ${process.env.NODE_ENV || 'development'}`)
        this.logger.info(this.logPrefix, `Base URL: ${process.env.BASE_URL || `http://localhost:${this.port}`}`)
        
        // Initialize services in background (non-blocking)
        this._initializeServicesInBackground()
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
      this.logger.fatal(this.logPrefix, 'Failed to start server:', error)
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