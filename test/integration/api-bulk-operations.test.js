import { describe, it, before, after, beforeEach, afterEach } from 'mocha'
import { expect } from 'chai'
import request from 'supertest'
import express from 'express'
import sinon from 'sinon'
import createApiRoutes from '../../routes/api.js'

/**
 * Integration tests for bulk API operations
 * Tests various payload sizes and batch processing scenarios
 */
describe('API Bulk Operations Integration Tests', () => {
  let app
  let mockDatabaseService
  let mockRedisService
  let mockLogger
  let sandbox

  before(() => {
    sandbox = sinon.createSandbox()
    
    // Create Express app
    app = express()
    app.use(express.json({ limit: '10mb' })) // Increase limit for bulk testing

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
    // Set up default mocks for short code generation
    mockRedisService.getShortCode.callsFake(() => {
      const codes = ['abc123', 'def456', 'ghi789', 'jkl012', 'mno345']
      return Promise.resolve(codes[Math.floor(Math.random() * codes.length)])
    })
    mockRedisService.cacheUrl.resolves()
  })

  afterEach(() => {
    sandbox.resetHistory()
  })

  after(() => {
    sandbox.restore()
  })

  describe('POST /api/shorten/bulk - Payload Size Tests', () => {
    it('should handle minimum payload (1 URL)', async () => {
      const urls = ['https://example.com/single']
      
      const mockDbResults = [{
        id: 'test-id-1',
        originalUrl: urls[0],
        shortCode: 'abc123',
        createdAt: new Date('2024-01-15T10:30:00Z'),
        expiresAt: new Date('2024-07-15T10:30:00Z'),
        clickCount: 0
      }]

      mockDatabaseService.getClient().$transaction.resolves(mockDbResults)

      const response = await request(app)
        .post('/api/shorten/bulk')
        .send({ urls })
        .expect(201)

      expect(response.body.success).to.be.true
      expect(response.body.data).to.have.lengthOf(1)
      expect(response.body.data[0].original_url).to.equal(urls[0])
    })

    it('should handle small batch (10 URLs)', async () => {
      const urls = Array(10).fill().map((_, i) => `https://example.com/url-${i}`)
      
      const mockDbResults = urls.map((url, index) => ({
        id: `test-id-${index}`,
        originalUrl: url,
        shortCode: `code-${index}`,
        createdAt: new Date('2024-01-15T10:30:00Z'),
        expiresAt: new Date('2024-07-15T10:30:00Z'),
        clickCount: 0
      }))

      mockDatabaseService.getClient().$transaction.resolves(mockDbResults)

      const response = await request(app)
        .post('/api/shorten/bulk')
        .send({ urls })
        .expect(201)

      expect(response.body.success).to.be.true
      expect(response.body.data).to.have.lengthOf(10)
      
      // Verify all URLs are processed
      response.body.data.forEach((item, index) => {
        expect(item.original_url).to.equal(urls[index])
        expect(item.short_code).to.be.a('string')
        expect(item.short_url).to.include(item.short_code)
      })
    })

    it('should handle medium batch (100 URLs)', async () => {
      const urls = Array(100).fill().map((_, i) => `https://example.com/medium-${i}`)
      
      const mockDbResults = urls.map((url, index) => ({
        id: `test-id-${index}`,
        originalUrl: url,
        shortCode: `med-${index}`,
        createdAt: new Date('2024-01-15T10:30:00Z'),
        expiresAt: new Date('2024-07-15T10:30:00Z'),
        clickCount: 0
      }))

      mockDatabaseService.getClient().$transaction.resolves(mockDbResults)

      const startTime = Date.now()
      const response = await request(app)
        .post('/api/shorten/bulk')
        .send({ urls })
        .expect(201)
      const endTime = Date.now()

      expect(response.body.success).to.be.true
      expect(response.body.data).to.have.lengthOf(100)
      expect(endTime - startTime).to.be.lessThan(5000) // Should complete within 5 seconds

      // Verify transaction was called once for all URLs
      expect(mockDatabaseService.getClient().$transaction).to.have.been.calledOnce
    })

    it('should handle large batch (1000 URLs - maximum allowed)', async () => {
      const urls = Array(1000).fill().map((_, i) => `https://example.com/large-${i}`)
      
      const mockDbResults = urls.map((url, index) => ({
        id: `test-id-${index}`,
        originalUrl: url,
        shortCode: `lg-${index}`,
        createdAt: new Date('2024-01-15T10:30:00Z'),
        expiresAt: new Date('2024-07-15T10:30:00Z'),
        clickCount: 0
      }))

      mockDatabaseService.getClient().$transaction.resolves(mockDbResults)

      const startTime = Date.now()
      const response = await request(app)
        .post('/api/shorten/bulk')
        .send({ urls })
        .expect(201)
      const endTime = Date.now()

      expect(response.body.success).to.be.true
      expect(response.body.data).to.have.lengthOf(1000)
      expect(endTime - startTime).to.be.lessThan(10000) // Should complete within 10 seconds

      // Verify caching was attempted for all URLs
      expect(mockRedisService.cacheUrl.callCount).to.equal(1000)
    })

    it('should reject batch exceeding maximum limit (1001 URLs)', async () => {
      const urls = Array(1001).fill('https://example.com')

      const response = await request(app)
        .post('/api/shorten/bulk')
        .send({ urls })
        .expect(400)

      expect(response.body.error.message).to.include('Too many URLs')
      expect(mockDatabaseService.getClient().$transaction).to.not.have.been.called
    })

    it('should handle mixed valid and invalid URLs in large batch', async () => {
      const validUrls = Array(500).fill().map((_, i) => `https://example.com/valid-${i}`)
      const invalidUrls = Array(500).fill().map((_, i) => `invalid-url-${i}`)
      const urls = [...validUrls, ...invalidUrls]

      const response = await request(app)
        .post('/api/shorten/bulk')
        .send({ urls })
        .expect(400)

      expect(response.body.error.message).to.include('Invalid URL')
      expect(response.body.error.details).to.be.an('array')
      expect(response.body.error.details).to.have.lengthOf(500) // All invalid URLs should be reported
      expect(mockDatabaseService.getClient().$transaction).to.not.have.been.called
    })
  })

  describe('Bulk Operations Performance and Reliability', () => {
    it('should handle duplicate URLs in bulk request efficiently', async () => {
      const baseUrl = 'https://example.com/duplicate'
      const urls = Array(100).fill(baseUrl) // All the same URL
      
      const mockDbResults = urls.map((url, index) => ({
        id: `test-id-${index}`,
        originalUrl: url,
        shortCode: `dup-${index}`, // Different short codes for same URL
        createdAt: new Date('2024-01-15T10:30:00Z'),
        expiresAt: new Date('2024-07-15T10:30:00Z'),
        clickCount: 0
      }))

      mockDatabaseService.getClient().$transaction.resolves(mockDbResults)

      const response = await request(app)
        .post('/api/shorten/bulk')
        .send({ urls })
        .expect(201)

      expect(response.body.success).to.be.true
      expect(response.body.data).to.have.lengthOf(100)

      // Each duplicate should get a unique short code
      const shortCodes = response.body.data.map(item => item.short_code)
      const uniqueShortCodes = new Set(shortCodes)
      expect(uniqueShortCodes.size).to.equal(100) // All should be unique
    })

    it('should handle partial Redis failures during bulk caching', async () => {
      const urls = Array(50).fill().map((_, i) => `https://example.com/cache-test-${i}`)
      
      const mockDbResults = urls.map((url, index) => ({
        id: `test-id-${index}`,
        originalUrl: url,
        shortCode: `ct-${index}`,
        createdAt: new Date('2024-01-15T10:30:00Z'),
        expiresAt: new Date('2024-07-15T10:30:00Z'),
        clickCount: 0
      }))

      mockDatabaseService.getClient().$transaction.resolves(mockDbResults)

      // Simulate intermittent caching failures
      mockRedisService.cacheUrl.callsFake(() => {
        if (Math.random() < 0.3) {
          return Promise.reject(new Error('Cache write failed'))
        }
        return Promise.resolve()
      })

      const response = await request(app)
        .post('/api/shorten/bulk')
        .send({ urls })
        .expect(201)

      expect(response.body.success).to.be.true
      expect(response.body.data).to.have.lengthOf(50)

      // Should have warnings logged but operation should succeed
      expect(mockLogger.warn.called).to.be.true
    })

    it('should maintain transaction atomicity on database failures', async () => {
      const urls = Array(20).fill().map((_, i) => `https://example.com/atomic-${i}`)

      // Simulate transaction failure
      mockDatabaseService.getClient().$transaction.rejects(new Error('Transaction deadlock'))

      const response = await request(app)
        .post('/api/shorten/bulk')
        .send({ urls })
        .expect(500)

      expect(response.body.error.message).to.include('Failed to create bulk short URLs')

      // Verify no caching was attempted since transaction failed
      expect(mockRedisService.cacheUrl).to.not.have.been.called
    })

    it('should handle concurrent bulk requests', async () => {
      const batchSize = 50
      const numConcurrentRequests = 5

      // Create different URL sets for each request
      const urlSets = Array(numConcurrentRequests).fill().map((_, setIndex) =>
        Array(batchSize).fill().map((_, urlIndex) => 
          `https://example.com/concurrent-${setIndex}-${urlIndex}`
        )
      )

      // Mock successful responses for all requests
      urlSets.forEach((urls, setIndex) => {
        const mockDbResults = urls.map((url, index) => ({
          id: `test-id-${setIndex}-${index}`,
          originalUrl: url,
          shortCode: `cc-${setIndex}-${index}`,
          createdAt: new Date('2024-01-15T10:30:00Z'),
          expiresAt: new Date('2024-07-15T10:30:00Z'),
          clickCount: 0
        }))

        mockDatabaseService.getClient().$transaction
          .onCall(setIndex).resolves(mockDbResults)
      })

      // Execute concurrent requests
      const promises = urlSets.map(urls =>
        request(app)
          .post('/api/shorten/bulk')
          .send({ urls })
      )

      const responses = await Promise.all(promises)

      // Verify all requests succeeded
      responses.forEach((response, index) => {
        expect(response.status).to.equal(201)
        expect(response.body.success).to.be.true
        expect(response.body.data).to.have.lengthOf(batchSize)
      })

      // Verify all transactions were called
      expect(mockDatabaseService.getClient().$transaction.callCount).to.equal(numConcurrentRequests)
    })
  })

  describe('Bulk Operations Error Handling', () => {
    it('should provide detailed error information for validation failures', async () => {
      const urls = [
        'https://valid1.com',
        'invalid-url-1',
        'https://valid2.com',
        'ftp://invalid-protocol.com',
        'https://valid3.com',
        'invalid-url-2'
      ]

      const response = await request(app)
        .post('/api/shorten/bulk')
        .send({ urls })
        .expect(400)

      expect(response.body.error.details).to.be.an('array')
      expect(response.body.error.details).to.have.lengthOf(3) // Three invalid URLs

      // Check that error details include specific invalid URLs
      const errorDetails = response.body.error.details.join(' ')
      expect(errorDetails).to.include('invalid-url-1')
      expect(errorDetails).to.include('ftp://invalid-protocol.com')
      expect(errorDetails).to.include('invalid-url-2')
    })

    it('should handle malformed request payloads gracefully', async () => {
      const response = await request(app)
        .post('/api/shorten/bulk')
        .set('Content-Type', 'application/json')
        .send('{"urls": [invalid json array}')
        .expect(400)

      expect(response.body.error.code).to.equal('BadRequest')
      expect(response.body.error.message).to.include('Invalid JSON')
    })

    it('should handle extremely large individual URLs in bulk request', async () => {
      const normalUrls = Array(5).fill().map((_, i) => `https://example.com/normal-${i}`)
      const extremelyLongUrl = 'https://example.com/' + 'a'.repeat(5000)
      const urls = [...normalUrls, extremelyLongUrl]

      const response = await request(app)
        .post('/api/shorten/bulk')
        .send({ urls })
        .expect(400)

      expect(response.body.error.message).to.include('URL too long')
      expect(response.body.error.details).to.be.an('array')
      expect(response.body.error.details[0]).to.include('https://example.com/aaa')
    })

    it('should validate bulk request timeout behavior', async () => {
      const urls = Array(1000).fill().map((_, i) => `https://example.com/timeout-${i}`)

      // Simulate slow database transaction
      mockDatabaseService.getClient().$transaction.callsFake(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            const mockDbResults = urls.map((url, index) => ({
              id: `test-id-${index}`,
              originalUrl: url,
              shortCode: `to-${index}`,
              createdAt: new Date('2024-01-15T10:30:00Z'),
              expiresAt: new Date('2024-07-15T10:30:00Z'),
              clickCount: 0
            }))
            resolve(mockDbResults)
          }, 100) // Small delay to simulate processing time
        })
      })

      const startTime = Date.now()
      const response = await request(app)
        .post('/api/shorten/bulk')
        .send({ urls })
        .timeout(30000) // 30 second timeout
        .expect(201)
      const endTime = Date.now()

      expect(response.body.success).to.be.true
      expect(endTime - startTime).to.be.lessThan(30000) // Should complete within timeout
    })
  })

  describe('Edge Cases and Data Integrity', () => {
    it('should maintain order of URLs in bulk response', async () => {
      const urls = [
        'https://first.com',
        'https://second.com',
        'https://third.com',
        'https://fourth.com',
        'https://fifth.com'
      ]

      const mockDbResults = urls.map((url, index) => ({
        id: `test-id-${index}`,
        originalUrl: url,
        shortCode: `order-${index}`,
        createdAt: new Date('2024-01-15T10:30:00Z'),
        expiresAt: new Date('2024-07-15T10:30:00Z'),
        clickCount: 0
      }))

      mockDatabaseService.getClient().$transaction.resolves(mockDbResults)

      const response = await request(app)
        .post('/api/shorten/bulk')
        .send({ urls })
        .expect(201)

      expect(response.body.success).to.be.true
      
      // Verify order is maintained
      response.body.data.forEach((item, index) => {
        expect(item.original_url).to.equal(urls[index])
      })
    })

    it('should handle Unicode and special characters in bulk URLs', async () => {
      const urls = [
        'https://example.com/测试',
        'https://example.com/tëst',
        'https://example.com/тест',
        'https://example.com/🚀',
        'https://example.com/path with spaces',
        'https://example.com/path?query=value&param=测试'
      ]

      // These should be encoded properly for validation
      const encodedUrls = urls.map(url => encodeURI(url))

      const mockDbResults = encodedUrls.map((url, index) => ({
        id: `test-id-${index}`,
        originalUrl: url,
        shortCode: `unicode-${index}`,
        createdAt: new Date('2024-01-15T10:30:00Z'),
        expiresAt: new Date('2024-07-15T10:30:00Z'),
        clickCount: 0
      }))

      mockDatabaseService.getClient().$transaction.resolves(mockDbResults)

      const response = await request(app)
        .post('/api/shorten/bulk')
        .send({ urls: encodedUrls })
        .expect(201)

      expect(response.body.success).to.be.true
      expect(response.body.data).to.have.lengthOf(encodedUrls.length)
    })

    it('should handle empty strings and whitespace in URL array', async () => {
      const urls = [
        'https://valid1.com',
        '',
        '   ',
        'https://valid2.com',
        '\t\n',
        'https://valid3.com'
      ]

      const response = await request(app)
        .post('/api/shorten/bulk')
        .send({ urls })
        .expect(400)

      expect(response.body.error.message).to.include('Invalid URL')
      expect(response.body.error.details).to.be.an('array')
      expect(response.body.error.details).to.have.lengthOf(3) // Three empty/whitespace URLs
    })
  })
}) 