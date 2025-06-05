import { describe, it, beforeEach } from 'mocha'
import { expect } from 'chai'
import UrlService from '../../services/UrlService.js'
import createLogger from '../../libs/logger.js'

/**
 * Unit tests for UrlService integration with DatabaseService and RedisService
 * Focuses on error handling, fallback scenarios, and service integration
 */
describe('UrlService Integration Tests', () => {
  let urlService
  let logger
  let mockDatabase
  let mockRedis

  beforeEach(() => {
    logger = createLogger()
    
    // Create mock database service
    mockDatabase = {
      isConnected: true,
      healthCheck: () => Promise.resolve({ healthy: true, responseTime: 10 }),
      getClient: () => ({
        url: {
          create: (options) => Promise.resolve({
            id: 'test-id',
            originalUrl: options.data.originalUrl,
            shortCode: options.data.shortCode,
            createdAt: new Date(),
            expiresAt: options.data.expiresAt,
            clickCount: 0
          }),
          findUnique: () => Promise.resolve(null),
          findMany: () => Promise.resolve([]),
          update: () => Promise.resolve({ clickCount: 1 }),
          delete: () => Promise.resolve({})
        },
        $transaction: (fn) => fn({
          url: {
            create: (options) => Promise.resolve({
              id: 'test-id',
              originalUrl: options.data.originalUrl,
              shortCode: options.data.shortCode,
              createdAt: new Date(),
              expiresAt: options.data.expiresAt,
              clickCount: 0
            })
          }
        })
      })
    }

    // Create mock Redis service
    mockRedis = {
      isConnected: true,
      getShortCode: () => Promise.resolve({
        code: 'abc123',
        source: 'redis_pool',
        responseTime: 5
      }),
      cacheUrl: () => Promise.resolve(),
      getCachedUrl: () => Promise.resolve(null),
      removeCachedUrl: () => Promise.resolve()
    }
  })

  describe('Constructor and Dependency Validation', () => {
    it('should throw error when database service is missing', () => {
      expect(() => {
        new UrlService(null, mockRedis, logger)
      }).to.throw('UrlService requires a database service instance')
    })

    it('should throw error when redis service is missing', () => {
      expect(() => {
        new UrlService(mockDatabase, null, logger)
      }).to.throw('UrlService requires a redis service instance')
    })

    it('should throw error when logger is missing', () => {
      expect(() => {
        new UrlService(mockDatabase, mockRedis, null)
      }).to.throw('UrlService requires a logger instance')
    })

    it('should initialize successfully with all dependencies', () => {
      expect(() => {
        urlService = new UrlService(mockDatabase, mockRedis, logger)
      }).to.not.throw()
    })
  })

  describe('Database Integration Tests', () => {
    beforeEach(() => {
      urlService = new UrlService(mockDatabase, mockRedis, logger)
    })

    it('should check database health before URL creation', async () => {
      let healthCheckCalled = false
      mockDatabase.healthCheck = () => {
        healthCheckCalled = true
        return Promise.resolve({ healthy: true, responseTime: 10 })
      }

      await urlService.createShortUrl('https://example.com')
      expect(healthCheckCalled).to.be.true
    })

    it('should handle database health check failure', async () => {
      mockDatabase.healthCheck = () => Promise.reject(new Error('Database health check failed'))

      try {
        await urlService.createShortUrl('https://example.com')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).to.include('Database service unavailable')
      }
    })

    it('should handle database disconnection', async () => {
      mockDatabase.isConnected = false
      mockDatabase.healthCheck = () => Promise.reject(new Error('Database client not connected'))

      try {
        await urlService.createShortUrl('https://example.com')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).to.include('Database service unavailable')
      }
    })

    it('should handle database timeout errors', async () => {
      mockDatabase.healthCheck = () => new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Database health check timeout')), 10)
      })

      try {
        await urlService.createShortUrl('https://example.com')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).to.include('Database service unavailable')
      }
    })

    it('should handle unique constraint violations with retry', async () => {
      let createCallCount = 0
      mockDatabase.getClient = () => ({
        url: {
          create: (options) => {
            createCallCount++
            if (createCallCount === 1) {
              // First call fails with unique constraint violation
              const error = new Error('Unique constraint failed')
              error.code = 'P2002'
              error.meta = { target: ['shortCode'] }
              return Promise.reject(error)
            }
            // Second call succeeds
            return Promise.resolve({
              id: 'test-id',
              originalUrl: options.data.originalUrl,
              shortCode: options.data.shortCode,
              createdAt: new Date(),
              expiresAt: options.data.expiresAt,
              clickCount: 0
            })
          }
        }
      })

      const result = await urlService.createShortUrl('https://example.com')
      expect(result).to.have.property('shortCode')
      expect(createCallCount).to.equal(2)
    })

    it('should handle database connection errors during operations', async () => {
      mockDatabase.getClient = () => ({
        url: {
          create: (options) => {
            const error = new Error('Connection refused')
            error.code = 'P1001'
            return Promise.reject(error)
          }
        }
      })

      try {
        await urlService.createShortUrl('https://example.com')
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).to.include('Database service unavailable')
      }
    })
  })

  describe('Redis Integration Tests', () => {
    beforeEach(() => {
      urlService = new UrlService(mockDatabase, mockRedis, logger)
    })

    it('should get short code from Redis when available', async () => {
      let redisGetShortCodeCalled = false
      mockRedis.getShortCode = () => {
        redisGetShortCodeCalled = true
        return Promise.resolve({
          code: 'redis123',
          source: 'redis_pool',
          responseTime: 5
        })
      }

      const result = await urlService.createShortUrl('https://example.com')
      expect(redisGetShortCodeCalled).to.be.true
      expect(result.shortCode).to.be.a('string')
      expect(result.shortCode).to.have.length.greaterThan(0)
    })

    it('should fallback to local generation when Redis fails', async () => {
      mockRedis.isConnected = false
      mockRedis.getShortCode = () => Promise.reject(new Error('Redis connection failed'))

      const result = await urlService.createShortUrl('https://example.com')
      expect(result).to.have.property('shortCode')
      expect(result.shortCode).to.be.a('string')
      expect(result.shortCode).to.have.length.at.least(5) // Default fallback length
    })

    it('should handle Redis disconnection gracefully', async () => {
      mockRedis.isConnected = false

      const result = await urlService.createShortUrl('https://example.com')
      expect(result).to.have.property('shortCode')
      // Should use local fallback generation
    })

    it('should cache URLs when Redis is available', async () => {
      let cacheUrlCalled = false
      mockRedis.cacheUrl = (shortCode, originalUrl, ttl) => {
        cacheUrlCalled = true
        expect(shortCode).to.be.a('string')
        expect(originalUrl).to.equal('https://example.com')
        expect(ttl).to.be.a('number')
        return Promise.resolve()
      }

      await urlService.createShortUrl('https://example.com')
      expect(cacheUrlCalled).to.be.true
    })

    it('should continue operation even if caching fails', async () => {
      mockRedis.cacheUrl = () => Promise.reject(new Error('Cache write failed'))

      const result = await urlService.createShortUrl('https://example.com')
      expect(result).to.have.property('shortCode')
      // Should complete successfully despite cache failure
    })

    it('should handle cache retrieval failures gracefully', async () => {
      // Setup existing URL in database
      mockDatabase.getClient = () => ({
        url: {
          findUnique: () => Promise.resolve({
            id: 'test-id',
            originalUrl: 'https://example.com',
            shortCode: 'abc123',
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000),
            clickCount: 5
          })
        }
      })

      mockRedis.getCachedUrl = () => Promise.reject(new Error('Cache read failed'))

      const result = await urlService.getUrlByShortCode('abc123')
      expect(result).to.have.property('originalUrl', 'https://example.com')
      // Should fallback to database lookup
    })
  })

  describe('Graceful Degradation Tests', () => {
    beforeEach(() => {
      urlService = new UrlService(mockDatabase, mockRedis, logger)
    })

    it('should work with Redis completely unavailable', async () => {
      // Simulate Redis completely down
      mockRedis.isConnected = false
      mockRedis.getShortCode = () => Promise.reject(new Error('Redis unavailable'))
      mockRedis.cacheUrl = () => Promise.reject(new Error('Redis unavailable'))
      mockRedis.getCachedUrl = () => Promise.reject(new Error('Redis unavailable'))
      mockRedis.removeCachedUrl = () => Promise.reject(new Error('Redis unavailable'))

      // Should still work with fallback mechanisms
      const createResult = await urlService.createShortUrl('https://example.com')
      expect(createResult).to.have.property('shortCode')
      expect(createResult.shortCode).to.be.a('string')

      // Setup for retrieval test
      mockDatabase.getClient = () => ({
        url: {
          findUnique: (query) => Promise.resolve({
            id: 'test-id',
            originalUrl: 'https://example.com',
            shortCode: query.where.shortCode,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000),
            clickCount: 0
          }),
          delete: () => Promise.resolve({})
        }
      })

      const getResult = await urlService.getUrlByShortCode(createResult.shortCode)
      expect(getResult).to.have.property('originalUrl', 'https://example.com')

      const deleteResult = await urlService.deleteUrl(createResult.shortCode)
      expect(deleteResult).to.be.true
    })

    it('should handle partial Redis functionality', async () => {
      // Redis connected but some operations fail
      mockRedis.isConnected = true
      mockRedis.getShortCode = () => Promise.resolve({
        code: 'partial123',
        source: 'redis_pool',
        responseTime: 5
      })
      mockRedis.cacheUrl = () => Promise.reject(new Error('Cache write failed'))
      mockRedis.getCachedUrl = () => Promise.reject(new Error('Cache read failed'))

      const result = await urlService.createShortUrl('https://example.com')
      expect(result).to.have.property('shortCode')
      expect(result.shortCode).to.be.a('string')
      // Should complete successfully despite cache failures
    })
  })

  describe('Error Categorization Tests', () => {
    beforeEach(() => {
      urlService = new UrlService(mockDatabase, mockRedis, logger)
    })

    it('should categorize database connection errors correctly', async () => {
      const connectionErrors = [
        { code: 'P1001', message: 'Can\'t reach database server' },
        { code: 'P1002', message: 'Database server unreachable' },
        { code: 'P1008', message: 'Operations timed out' },
        { message: 'connection refused' },
        { message: 'connection timeout' }
      ]

      for (const errorData of connectionErrors) {
        mockDatabase.getClient = () => ({
          url: {
            create: (options) => {
              const error = new Error(errorData.message || 'Connection error')
              if (errorData.code) error.code = errorData.code
              return Promise.reject(error)
            }
          }
        })

        try {
          await urlService.createShortUrl('https://example.com')
          expect.fail('Should have thrown an error')
        } catch (error) {
          expect(error.message).to.include('Database service unavailable')
        }
      }
    })

    it('should handle unique constraint violations appropriately', async () => {
      let attemptCount = 0
      let getShortCodeCallCount = 0
      
      // Mock Redis to return different codes each time
      mockRedis.getShortCode = () => {
        getShortCodeCallCount++
        return Promise.resolve({
          code: `attempt${getShortCodeCallCount}`,
          source: 'redis_pool',
          responseTime: 5
        })
      }
      
      mockDatabase.getClient = () => ({
        url: {
          create: (options) => {
            attemptCount++
            // Always fail with unique constraint error - this will exhaust all 3 attempts
            const error = new Error('Unique constraint failed')
            error.code = 'P2002'
            error.meta = { target: ['shortCode'] }
            return Promise.reject(error)
          }
        }
      })

      // Should fail after 3 attempts with the generic error message
      try {
        await urlService.createShortUrl('https://example.com')
        expect.fail('Should have thrown an error after max attempts')
      } catch (error) {
        expect(error.message).to.include('Failed to create shortened URL')
        expect(attemptCount).to.equal(3) // Should have tried 3 times
        expect(getShortCodeCallCount).to.equal(3) // Initial + 2 retries
      }
    })
  })

  describe('Bulk Operations Integration', () => {
    beforeEach(() => {
      urlService = new UrlService(mockDatabase, mockRedis, logger)
    })

    it('should handle Redis unavailable during bulk operations', async () => {
      mockRedis.isConnected = false

      // Mock successful transaction
      let transactionCalled = false
      mockDatabase.getClient = () => ({
        $transaction: (fn) => {
          transactionCalled = true
          return fn({
            url: {
              create: (options) => Promise.resolve({
                id: `test-id-${Date.now()}`,
                originalUrl: options.data.originalUrl,
                shortCode: options.data.shortCode,
                createdAt: new Date(),
                expiresAt: options.data.expiresAt,
                clickCount: 0
              })
            }
          })
        }
      })

      const result = await urlService.createBulkShortUrls([
        'https://example1.com',
        'https://example2.com'
      ])

      expect(transactionCalled).to.be.true
      expect(result.successCount).to.equal(2)
      expect(result.failureCount).to.equal(0)
    })

    it('should handle database failures during bulk operations', async () => {
      mockDatabase.getClient = () => ({
        $transaction: () => Promise.reject(new Error('Transaction failed'))
      })

      try {
        await urlService.createBulkShortUrls([
          'https://example1.com',
          'https://example2.com'
        ])
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error.message).to.include('Failed to create bulk URLs')
      }
    })
  })
}) 