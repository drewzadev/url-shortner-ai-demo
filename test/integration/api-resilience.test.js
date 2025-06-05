import { describe, it, before, after, beforeEach, afterEach } from 'mocha'
import { expect } from 'chai'
import request from 'supertest'
import express from 'express'
import sinon from 'sinon'
import createApiRoutes from '../../routes/api.js'

/**
 * Integration tests for API resilience and error handling
 * Tests Redis and database failure scenarios
 */
describe('API Resilience Integration Tests', () => {
  let app
  let mockDatabaseService
  let mockRedisService
  let mockLogger
  let sandbox

  before(() => {
    sandbox = sinon.createSandbox()
    
    // Create Express app
    app = express()
    app.use(express.json())

    // Mock services
    mockDatabaseService = {
      getClient: sandbox.stub().returns({
        url: {
          create: sandbox.stub(),
          findUnique: sandbox.stub(),
          findMany: sandbox.stub(),
          delete: sandbox.stub(),
          update: sandbox.stub()
        },
        $transaction: sandbox.stub()
      }),
      healthCheck: sandbox.stub().resolves(true)
    }

    mockRedisService = {
      getShortCode: sandbox.stub(),
      cacheUrl: sandbox.stub(),
      getCachedUrl: sandbox.stub(),
      removeCachedUrl: sandbox.stub(),
      isHealthy: sandbox.stub().returns(true)
    }

    mockLogger = {
      debug: sandbox.stub(),
      info: sandbox.stub(),
      warn: sandbox.stub(),
      error: sandbox.stub(),
      fatal: sandbox.stub()
    }

    // Use test routes with mocked dependencies
    app.use('/api', createApiRoutes(mockDatabaseService, mockRedisService, mockLogger))
  })

  beforeEach(() => {
    sandbox.resetHistory()
    // Reset health status
    mockRedisService.isHealthy.returns(true)
  })

  afterEach(() => {
    sandbox.resetHistory()
  })

  after(() => {
    sandbox.restore()
  })

  describe('Redis Failure Scenarios', () => {
    describe('POST /api/shorten - Redis Failures', () => {
      const validUrl = 'https://example.com/redis-test'
      const fallbackShortCode = 'fallback123'

      const mockDbResult = {
        id: 'test-id',
        originalUrl: validUrl,
        shortCode: fallbackShortCode,
        createdAt: new Date('2024-01-15T10:30:00Z'),
        expiresAt: new Date('2024-07-15T10:30:00Z'),
        clickCount: 0
      }

      it('should handle Redis short code generation failure gracefully', async () => {
        mockRedisService.getShortCode.rejects(new Error('Redis connection timeout'))
        mockDatabaseService.getClient().url.create.resolves(mockDbResult)
        mockRedisService.cacheUrl.resolves() // Cache might still work

        const response = await request(app)
          .post('/api/shorten')
          .send({ url: validUrl })
          .expect(201)

        expect(response.body.success).to.be.true
        expect(response.body.data.short_code).to.equal(fallbackShortCode)

        // Verify fallback was used and warning logged
        expect(mockLogger.warn).to.have.been.calledWith(
          sinon.match.string,
          sinon.match(/Redis.*failed.*fallback/i)
        )
      })

      it('should handle Redis caching failure without affecting URL creation', async () => {
        mockRedisService.getShortCode.resolves('abc123')
        mockDatabaseService.getClient().url.create.resolves(mockDbResult)
        mockRedisService.cacheUrl.rejects(new Error('Redis write failed'))

        const response = await request(app)
          .post('/api/shorten')
          .send({ url: validUrl })
          .expect(201)

        expect(response.body.success).to.be.true
        expect(mockLogger.warn).to.have.been.calledWith(
          sinon.match.string,
          sinon.match(/Failed to cache.*continuing/i)
        )
      })

      it('should handle complete Redis service failure', async () => {
        mockRedisService.getShortCode.rejects(new Error('Redis unavailable'))
        mockRedisService.cacheUrl.rejects(new Error('Redis unavailable'))
        mockRedisService.isHealthy.returns(false)
        mockDatabaseService.getClient().url.create.resolves(mockDbResult)

        const response = await request(app)
          .post('/api/shorten')
          .send({ url: validUrl })
          .expect(201)

        expect(response.body.success).to.be.true
        expect(mockLogger.warn.callCount).to.be.greaterThan(0)
      })
    })

    describe('GET /api/url/:shortCode - Redis Cache Failures', () => {
      const shortCode = 'abc123'
      const originalUrl = 'https://example.com/cached-test'

      const mockDbResult = {
        id: 'test-id',
        originalUrl: originalUrl,
        shortCode: shortCode,
        createdAt: new Date('2024-01-15T10:30:00Z'),
        expiresAt: new Date('2024-07-15T10:30:00Z'),
        clickCount: 42
      }

      it('should fallback to database when Redis cache lookup fails', async () => {
        mockRedisService.getCachedUrl.rejects(new Error('Redis connection lost'))
        mockDatabaseService.getClient().url.findUnique.resolves(mockDbResult)
        mockRedisService.cacheUrl.resolves() // Re-caching might work

        const response = await request(app)
          .get(`/api/url/${shortCode}`)
          .expect(200)

        expect(response.body.success).to.be.true
        expect(response.body.data.original_url).to.equal(originalUrl)

        // Should have fallen back to database
        expect(mockDatabaseService.getClient().url.findUnique).to.have.been.called
        expect(mockLogger.warn).to.have.been.calledWith(
          sinon.match.string,
          sinon.match(/Cache lookup failed.*falling back to database/i)
        )
      })

      it('should handle Redis re-caching failure after database retrieval', async () => {
        mockRedisService.getCachedUrl.resolves(null) // Cache miss
        mockDatabaseService.getClient().url.findUnique.resolves(mockDbResult)
        mockRedisService.cacheUrl.rejects(new Error('Redis write timeout'))

        const response = await request(app)
          .get(`/api/url/${shortCode}`)
          .expect(200)

        expect(response.body.success).to.be.true
        expect(mockLogger.warn).to.have.been.calledWith(
          sinon.match.string,
          sinon.match(/Failed to cache.*after database retrieval/i)
        )
      })
    })

    describe('DELETE /api/url/:shortCode - Redis Cache Invalidation Failures', () => {
      const shortCode = 'abc123'
      const originalUrl = 'https://example.com/delete-test'

      const mockDbResult = {
        id: 'test-id',
        originalUrl: originalUrl,
        shortCode: shortCode,
        createdAt: new Date('2024-01-15T10:30:00Z'),
        expiresAt: new Date('2024-07-15T10:30:00Z'),
        clickCount: 5
      }

      it('should handle Redis cache invalidation failure gracefully', async () => {
        mockDatabaseService.getClient().url.delete.resolves(mockDbResult)
        mockRedisService.removeCachedUrl.rejects(new Error('Redis remove failed'))

        const response = await request(app)
          .delete(`/api/url/${shortCode}`)
          .expect(200)

        expect(response.body.success).to.be.true
        expect(response.body.data.short_code).to.equal(shortCode)

        expect(mockLogger.warn).to.have.been.calledWith(
          sinon.match.string,
          sinon.match(/Failed to remove.*from cache/i)
        )
      })
    })

    describe('POST /api/shorten/bulk - Redis Failures in Bulk Operations', () => {
      const validUrls = [
        'https://example.com/bulk-1',
        'https://example.com/bulk-2',
        'https://example.com/bulk-3'
      ]

      const mockDbResults = validUrls.map((url, index) => ({
        id: `test-id-${index}`,
        originalUrl: url,
        shortCode: `bulk-${index}`,
        createdAt: new Date('2024-01-15T10:30:00Z'),
        expiresAt: new Date('2024-07-15T10:30:00Z'),
        clickCount: 0
      }))

      it('should handle Redis short code generation failure in bulk operations', async () => {
        mockRedisService.getShortCode.rejects(new Error('Redis pool empty'))
        mockDatabaseService.getClient().$transaction.resolves(mockDbResults)
        mockRedisService.cacheUrl.resolves()

        const response = await request(app)
          .post('/api/shorten/bulk')
          .send({ urls: validUrls })
          .expect(201)

        expect(response.body.success).to.be.true
        expect(response.body.data).to.have.lengthOf(3)
        expect(mockLogger.warn).to.have.been.called
      })

      it('should handle partial Redis caching failures in bulk operations', async () => {
        mockRedisService.getShortCode.resolves('bulk-code')
        mockDatabaseService.getClient().$transaction.resolves(mockDbResults)
        
        // Simulate intermittent caching failures
        let cacheCallCount = 0
        mockRedisService.cacheUrl.callsFake(() => {
          cacheCallCount++
          if (cacheCallCount % 2 === 0) {
            return Promise.reject(new Error('Cache write failed'))
          }
          return Promise.resolve()
        })

        const response = await request(app)
          .post('/api/shorten/bulk')
          .send({ urls: validUrls })
          .expect(201)

        expect(response.body.success).to.be.true
        expect(response.body.data).to.have.lengthOf(3)

        // Should have warnings but operation succeeds
        expect(mockLogger.warn.called).to.be.true
      })
    })
  })

  describe('Database Failure Scenarios', () => {
    describe('Database Connection Failures', () => {
      it('should handle database connection failure in POST /api/shorten', async () => {
        mockRedisService.getShortCode.resolves('abc123')
        mockDatabaseService.getClient().url.create.rejects(new Error('ECONNREFUSED'))

        const response = await request(app)
          .post('/api/shorten')
          .send({ url: 'https://example.com/db-test' })
          .expect(500)

        expect(response.body.status_code).to.equal(500)
        expect(response.body.error.code).to.equal('InternalServerError')
        expect(response.body.error.message).to.include('Failed to create short URL')
      })

      it('should handle database connection failure in GET /api/url/:shortCode', async () => {
        mockRedisService.getCachedUrl.resolves(null) // Cache miss
        mockDatabaseService.getClient().url.findUnique.rejects(new Error('Database connection lost'))

        const response = await request(app)
          .get('/api/url/abc123')
          .expect(500)

        expect(response.body.error.message).to.include('Failed to retrieve URL')
      })

      it('should handle database connection failure in DELETE /api/url/:shortCode', async () => {
        mockDatabaseService.getClient().url.delete.rejects(new Error('Connection timed out'))

        const response = await request(app)
          .delete('/api/url/abc123')
          .expect(500)

        expect(response.body.error.message).to.include('Failed to delete URL')
      })

      it('should handle database connection failure in GET /api/urls', async () => {
        mockDatabaseService.getClient().url.findMany.rejects(new Error('Database unavailable'))

        const response = await request(app)
          .get('/api/urls')
          .expect(500)

        expect(response.body.error.message).to.include('Failed to retrieve URLs')
      })
    })

    describe('Database Transaction Failures', () => {
      it('should handle transaction deadlock in bulk operations', async () => {
        const urls = ['https://example.com/tx-1', 'https://example.com/tx-2']
        
        mockRedisService.getShortCode.resolves('tx-code')
        mockDatabaseService.getClient().$transaction.rejects(new Error('Transaction deadlock detected'))

        const response = await request(app)
          .post('/api/shorten/bulk')
          .send({ urls })
          .expect(500)

        expect(response.body.error.message).to.include('Failed to create bulk short URLs')
        expect(mockLogger.error).to.have.been.called
      })

      it('should handle transaction timeout in bulk operations', async () => {
        const urls = Array(100).fill().map((_, i) => `https://example.com/timeout-${i}`)
        
        mockRedisService.getShortCode.resolves('timeout-code')
        mockDatabaseService.getClient().$transaction.rejects(new Error('Transaction timeout'))

        const response = await request(app)
          .post('/api/shorten/bulk')
          .send({ urls })
          .expect(500)

        expect(response.body.error.message).to.include('Failed to create bulk short URLs')
      })
    })

    describe('Database Constraint Violations', () => {
      it('should handle unique constraint violation with retry logic', async () => {
        const validUrl = 'https://example.com/constraint-test'
        const duplicateError = new Error('Unique constraint failed')
        duplicateError.code = 'P2002'

        const successResult = {
          id: 'test-id',
          originalUrl: validUrl,
          shortCode: 'retry-123',
          createdAt: new Date('2024-01-15T10:30:00Z'),
          expiresAt: new Date('2024-07-15T10:30:00Z'),
          clickCount: 0
        }

        mockRedisService.getShortCode
          .onFirstCall().resolves('duplicate-code')
          .onSecondCall().resolves('retry-123')

        mockDatabaseService.getClient().url.create
          .onFirstCall().rejects(duplicateError)
          .onSecondCall().resolves(successResult)

        mockRedisService.cacheUrl.resolves()

        const response = await request(app)
          .post('/api/shorten')
          .send({ url: validUrl })
          .expect(201)

        expect(response.body.success).to.be.true
        expect(response.body.data.short_code).to.equal('retry-123')

        // Should have logged the retry
        expect(mockLogger.warn).to.have.been.calledWith(
          sinon.match.string,
          sinon.match(/Duplicate short code.*retrying/i)
        )
      })

      it('should fail after maximum retry attempts', async () => {
        const validUrl = 'https://example.com/max-retry-test'
        const duplicateError = new Error('Unique constraint failed')
        duplicateError.code = 'P2002'

        mockRedisService.getShortCode.resolves('always-duplicate')
        mockDatabaseService.getClient().url.create.rejects(duplicateError)

        const response = await request(app)
          .post('/api/shorten')
          .send({ url: validUrl })
          .expect(500)

        expect(response.body.error.message).to.include('Failed to create short URL after retries')
        expect(mockDatabaseService.getClient().url.create.callCount).to.equal(3) // Max retries
      })
    })
  })

  describe('Combined Redis and Database Failures', () => {
    it('should handle simultaneous Redis and database failures gracefully', async () => {
      mockRedisService.getShortCode.rejects(new Error('Redis unavailable'))
      mockRedisService.cacheUrl.rejects(new Error('Redis unavailable'))
      mockRedisService.getCachedUrl.rejects(new Error('Redis unavailable'))
      mockDatabaseService.getClient().url.create.rejects(new Error('Database unavailable'))

      const response = await request(app)
        .post('/api/shorten')
        .send({ url: 'https://example.com/total-failure' })
        .expect(500)

      expect(response.body.error.code).to.equal('InternalServerError')
      
      // Should have logged both Redis and database failures
      expect(mockLogger.warn.called).to.be.true
      expect(mockLogger.error.called).to.be.true
    })

    it('should prioritize database operations when Redis fails', async () => {
      const shortCode = 'priority-test'
      const originalUrl = 'https://example.com/priority-test'

      const mockDbResult = {
        id: 'test-id',
        originalUrl: originalUrl,
        shortCode: shortCode,
        createdAt: new Date('2024-01-15T10:30:00Z'),
        expiresAt: new Date('2024-07-15T10:30:00Z'),
        clickCount: 10
      }

      // Redis completely fails
      mockRedisService.getCachedUrl.rejects(new Error('Redis down'))
      mockRedisService.cacheUrl.rejects(new Error('Redis down'))
      
      // Database works
      mockDatabaseService.getClient().url.findUnique.resolves(mockDbResult)

      const response = await request(app)
        .get(`/api/url/${shortCode}`)
        .expect(200)

      expect(response.body.success).to.be.true
      expect(response.body.data.original_url).to.equal(originalUrl)

      // Should have warned about Redis but succeeded with database
      expect(mockLogger.warn).to.have.been.called
    })
  })

  describe('Network and Timeout Scenarios', () => {
    it('should handle slow database responses', async () => {
      const validUrl = 'https://example.com/slow-db'
      
      mockRedisService.getShortCode.resolves('slow-123')
      
      // Simulate slow database response
      mockDatabaseService.getClient().url.create.callsFake(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              id: 'test-id',
              originalUrl: validUrl,
              shortCode: 'slow-123',
              createdAt: new Date(),
              expiresAt: new Date(),
              clickCount: 0
            })
          }, 200) // 200ms delay
        })
      })

      mockRedisService.cacheUrl.resolves()

      const startTime = Date.now()
      const response = await request(app)
        .post('/api/shorten')
        .send({ url: validUrl })
        .timeout(5000)
        .expect(201)
      const endTime = Date.now()

      expect(response.body.success).to.be.true
      expect(endTime - startTime).to.be.greaterThan(200)
      expect(endTime - startTime).to.be.lessThan(1000)
    })

    it('should handle Redis timeout with database fallback', async () => {
      const shortCode = 'timeout-test'
      const originalUrl = 'https://example.com/timeout-test'

      // Redis times out
      mockRedisService.getCachedUrl.callsFake(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Redis timeout')), 100)
        })
      })

      // Database responds normally
      mockDatabaseService.getClient().url.findUnique.resolves({
        id: 'test-id',
        originalUrl: originalUrl,
        shortCode: shortCode,
        createdAt: new Date('2024-01-15T10:30:00Z'),
        expiresAt: new Date('2024-07-15T10:30:00Z'),
        clickCount: 25
      })

      const response = await request(app)
        .get(`/api/url/${shortCode}`)
        .expect(200)

      expect(response.body.success).to.be.true
      expect(response.body.data.original_url).to.equal(originalUrl)
    })
  })

  describe('Service Health Monitoring', () => {
    it('should continue operations when Redis health check fails', async () => {
      mockRedisService.isHealthy.returns(false)
      mockRedisService.getShortCode.rejects(new Error('Redis unhealthy'))
      
      const mockDbResult = {
        id: 'test-id',
        originalUrl: 'https://example.com/health-test',
        shortCode: 'health-123',
        createdAt: new Date(),
        expiresAt: new Date(),
        clickCount: 0
      }

      mockDatabaseService.getClient().url.create.resolves(mockDbResult)

      const response = await request(app)
        .post('/api/shorten')
        .send({ url: 'https://example.com/health-test' })
        .expect(201)

      expect(response.body.success).to.be.true
      expect(mockLogger.warn).to.have.been.called
    })

    it('should log appropriate error levels for different failure types', async () => {
      // Test various failure scenarios to ensure proper logging
      
      // Redis warning-level failure
      mockRedisService.cacheUrl.rejects(new Error('Cache write failed'))
      mockRedisService.getShortCode.resolves('log-test')
      mockDatabaseService.getClient().url.create.resolves({
        id: 'test-id',
        originalUrl: 'https://example.com/log-test',
        shortCode: 'log-test',
        createdAt: new Date(),
        expiresAt: new Date(),
        clickCount: 0
      })

      await request(app)
        .post('/api/shorten')
        .send({ url: 'https://example.com/log-test' })
        .expect(201)

      expect(mockLogger.warn).to.have.been.called
      expect(mockLogger.error).to.not.have.been.called

      // Reset for next test
      sandbox.resetHistory()

      // Database error-level failure
      mockDatabaseService.getClient().url.create.rejects(new Error('Database error'))

      await request(app)
        .post('/api/shorten')
        .send({ url: 'https://example.com/db-error' })
        .expect(500)

      expect(mockLogger.error).to.have.been.called
    })
  })
}) 