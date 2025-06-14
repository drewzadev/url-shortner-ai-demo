import { PrismaClient } from '@prisma/client'
import __ from './attempt.mjs'
import { appConfig } from '../config/app.js'

export class DatabaseService {
  constructor(logger) {
    this.prisma = null
    this.isConnected = false
    this.logPrefix = 'DatabaseService'
    this.logger = logger
  }

  async connect() {
    if (this.isConnected && this.prisma) {
      this.logger.debug(this.logPrefix, 'Database already connected')
      return this.prisma
    }

    const maxRetries = 3
    let lastError

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const [error, client] = await __(this._createConnection())
      
      if (!error) {
        this.prisma = client
        this.isConnected = true
        this.logger.info(this.logPrefix, `Connected to database successfully on attempt ${attempt}`)
        return this.prisma
      }

      lastError = error
      this.logger.warn(this.logPrefix, `Database connection attempt ${attempt} failed`, error)
      
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000 // Exponential backoff
        this.logger.info(this.logPrefix, `Retrying database connection in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    this.logger.error(this.logPrefix, `Failed to connect to database after ${maxRetries} attempts`, lastError)
    throw lastError
  }

  async _createConnection() {
    const connectionConfig = {
      connectionLimit: appConfig.database.connectionPoolMax,
      poolTimeout: appConfig.database.poolTimeout,
      connectTimeout: appConfig.database.connectTimeout,
      socketTimeout: appConfig.database.socketTimeout,
      idleTimeout: appConfig.database.idleTimeout
    }

    this.logger.debug(this.logPrefix, 'Creating database connection with config', connectionConfig)

    const prisma = new PrismaClient({
      log: [
        {
          emit: 'event',
          level: 'query'
        },
        {
          emit: 'event',
          level: 'error'
        },
        {
          emit: 'event',
          level: 'info'
        },
        {
          emit: 'event',
          level: 'warn'
        }
      ],
      datasources: {
        db: {
          url: process.env.DATABASE_URL
        }
      }
    })

    // Add Prisma logging
    prisma.$on('query', (e) => {
      if (process.env.NODE_ENV === 'development') {
        this.logger.debug(this.logPrefix, 'Database query', {
          query: e.query,
          params: e.params,
          duration: e.duration
        })
      }
    })

    prisma.$on('error', (e) => {
      this.logger.error(this.logPrefix, 'Database error', e)
    })

    prisma.$on('warn', (e) => {
      this.logger.warn(this.logPrefix, 'Database warning', e)
    })

    prisma.$on('info', (e) => {
      this.logger.info(this.logPrefix, 'Database info', e)
    })

    // Test connection
    await prisma.$connect()
    
    return prisma
  }

  async disconnect() {
    if (this.prisma && this.isConnected) {
      const [error] = await __(this.prisma.$disconnect())
      if (error) {
        this.logger.error(this.logPrefix, 'Error disconnecting from database', error)
        throw error
      }
      
      this.prisma = null
      this.isConnected = false
      this.logger.info(this.logPrefix, 'Disconnected from database')
    }
  }

  async healthCheck() {
    if (!this.isConnected || !this.prisma) {
      throw new Error('Database client not connected')
    }

    const startTime = Date.now()
    const [error] = await __(this.prisma.$queryRaw`SELECT 1`)
    const responseTime = Date.now() - startTime
    
    if (error) {
      this.logger.error(this.logPrefix, 'Database health check failed', { error, responseTime })
      throw error
    }
    
    this.logger.debug(this.logPrefix, 'Database health check passed', { responseTime })
    return { healthy: true, responseTime }
  }

  getClient() {
    if (!this.isConnected || !this.prisma) {
      throw new Error('Database client not connected')
    }
    return this.prisma
  }
}