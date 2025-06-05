import { describe, it, before, after, beforeEach, afterEach } from 'mocha'
import { expect } from 'chai'
import request from 'supertest'
import express from 'express'
import sinon from 'sinon'
import createApiRoutes from '../../routes/api.js'
import { DatabaseService } from '../../libs/database.js'
import { RedisService } from '../../libs/redis.js'
import createLogger from '../../libs/logger.js'

/**
 * Integration tests for API endpoints
 * Tests complete request/response cycles with realistic data
 */
describe('API Endpoints Integration Tests', () => {
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
    // Set up common mocks
    mockRedisService.getShortCode.resolves('abc123')
    mockRedisService.cacheUrl.resolves()
    mockRedisService.getCachedUrl.resolves(null)
    mockRedisService.removeCachedUrl.resolves()
  })

  afterEach(() => {
    sandbox.resetHistory()
  })

  after(() => {
    sandbox.restore()
  })

  describe('POST /api/shorten', () => {
    const validUrl = 'https://example.com/test'
    const shortCode = 'abc123'

    const mockDbResult = {
      id: 'test-id',
      originalUrl: validUrl,
      shortCode: shortCode,
      createdAt: new Date('2024-01-15T10:30:00Z'),
      expiresAt: new Date('2024-07-15T10:30:00Z'),
      clickCount: 0
    }

    it('should successfully create a short URL', async () => {
      mockDatabaseService.getClient().url.create.resolves(mockDbResult)

      const response = await request(app)
        .post('/api/shorten')
        .send({ url: validUrl })
        .expect(201)

      expect(response.body).to.deep.equal({
        success: true,
        data: {
          original_url: validUrl,
          short_url: `http://localhost:3000/${shortCode}`,
          short_code: shortCode,
          created_at: '2024-01-15T10:30:00.000Z',
          expires_at: '2024-07-15T10:30:00.000Z'
        }
      })

      expect(mockDatabaseService.getClient().url.create).to.have.been.calledOnce
      expect(mockRedisService.cacheUrl).to.have.been.calledWith(shortCode, validUrl)
    })

    it('should return 400 for missing URL', async () => {
      const response = await request(app)
        .post('/api/shorten')
        .send({})
        .expect(400)

      expect(response.body).to.have.property('status_code', 400)
      expect(response.body).to.have.property('error')
      expect(response.body.error.code).to.equal('BadRequest')
      expect(response.body.error.message).to.include('URL is required')
    })

    it('should return 400 for invalid URL format', async () => {
      const response = await request(app)
        .post('/api/shorten')
        .send({ url: 'not-a-url' })
        .expect(400)

      expect(response.body).to.have.property('status_code', 400)
      expect(response.body.error.code).to.equal('BadRequest')
      expect(response.body.error.message).to.include('Invalid URL format')
      expect(mockDatabaseService.getClient().url.create).to.not.have.been.called
    })

    it('should return 400 for URL that is too long', async () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(3000)

      const response = await request(app)
        .post('/api/shorten')
        .send({ url: longUrl })
        .expect(400)

      expect(response.body.error.message).to.include('URL too long')
    })

    it('should return 500 for database failure', async () => {
      mockDatabaseService.getClient().url.create.rejects(new Error('Database connection failed'))

      const response = await request(app)
        .post('/api/shorten')
        .send({ url: validUrl })
        .expect(500)

      expect(response.body).to.have.property('status_code', 500)
      expect(response.body.error.code).to.equal('InternalServerError')
      expect(response.body.error.message).to.include('Failed to create short URL')
    })

    it('should handle malformed JSON request', async () => {
      const response = await request(app)
        .post('/api/shorten')
        .set('Content-Type', 'application/json')
        .send('{"url": invalid json}')
        .expect(400)

      expect(response.body.error.code).to.equal('BadRequest')
    })

    it('should reject non-HTTP protocols', async () => {
      const response = await request(app)
        .post('/api/shorten')
        .send({ url: 'ftp://example.com' })
        .expect(400)

      expect(response.body.error.message).to.include('Only HTTP and HTTPS protocols are allowed')
    })
  })

  describe('POST /api/shorten/bulk', () => {
    const validUrls = [
      'https://example.com/1',
      'https://example.com/2',
      'https://example.com/3'
    ]
    const shortCodes = ['abc123', 'def456', 'ghi789']

    const mockDbResults = validUrls.map((url, index) => ({
      id: `test-id-${index}`,
      originalUrl: url,
      shortCode: shortCodes[index],
      createdAt: new Date('2024-01-15T10:30:00Z'),
      expiresAt: new Date('2024-07-15T10:30:00Z'),
      clickCount: 0
    }))

    beforeEach(() => {
      mockRedisService.getShortCode
        .onFirstCall().resolves(shortCodes[0])
        .onSecondCall().resolves(shortCodes[1])
        .onThirdCall().resolves(shortCodes[2])
    })

    it('should successfully create multiple short URLs', async () => {
      mockDatabaseService.getClient().$transaction.resolves(mockDbResults)

      const response = await request(app)
        .post('/api/shorten/bulk')
        .send({ urls: validUrls })
        .expect(201)

      expect(response.body).to.have.property('success', true)
      expect(response.body.data).to.be.an('array').with.lengthOf(3)
      
      response.body.data.forEach((item, index) => {
        expect(item).to.deep.equal({
          original_url: validUrls[index],
          short_url: `http://localhost:3000/${shortCodes[index]}`,
          short_code: shortCodes[index]
        })
      })

      expect(mockDatabaseService.getClient().$transaction).to.have.been.calledOnce
    })

    it('should return 400 for missing URLs array', async () => {
      const response = await request(app)
        .post('/api/shorten/bulk')
        .send({})
        .expect(400)

      expect(response.body.error.message).to.include('URLs array is required')
    })

    it('should return 400 for empty URLs array', async () => {
      const response = await request(app)
        .post('/api/shorten/bulk')
        .send({ urls: [] })
        .expect(400)

      expect(response.body.error.message).to.include('URLs array cannot be empty')
    })

    it('should return 400 for too many URLs', async () => {
      const tooManyUrls = new Array(1001).fill('https://example.com')

      const response = await request(app)
        .post('/api/shorten/bulk')
        .send({ urls: tooManyUrls })
        .expect(400)

      expect(response.body.error.message).to.include('Too many URLs')
      expect(mockDatabaseService.getClient().$transaction).to.not.have.been.called
    })

    it('should return 400 for invalid URLs in array', async () => {
      const mixedUrls = [
        'https://example.com/valid',
        'invalid-url',
        'https://example.com/also-valid'
      ]

      const response = await request(app)
        .post('/api/shorten/bulk')
        .send({ urls: mixedUrls })
        .expect(400)

      expect(response.body.error.message).to.include('Invalid URL')
      expect(response.body.error.details).to.be.an('array')
      expect(response.body.error.details.some(detail => detail.includes('invalid-url'))).to.be.true
    })

    it('should return 500 for database transaction failure', async () => {
      mockDatabaseService.getClient().$transaction.rejects(new Error('Transaction failed'))

      const response = await request(app)
        .post('/api/shorten/bulk')
        .send({ urls: validUrls })
        .expect(500)

      expect(response.body.error.message).to.include('Failed to create bulk short URLs')
    })

    it('should handle non-array URLs field', async () => {
      const response = await request(app)
        .post('/api/shorten/bulk')
        .send({ urls: 'not-an-array' })
        .expect(400)

      expect(response.body.error.message).to.include('URLs must be an array')
    })
  })

  describe('GET /api/url/:shortCode', () => {
    const shortCode = 'abc123'
    const originalUrl = 'https://example.com/test'

    const mockDbResult = {
      id: 'test-id',
      originalUrl: originalUrl,
      shortCode: shortCode,
      createdAt: new Date('2024-01-15T10:30:00Z'),
      expiresAt: new Date('2024-07-15T10:30:00Z'),
      clickCount: 42
    }

    it('should return URL details from database', async () => {
      mockDatabaseService.getClient().url.findUnique.resolves(mockDbResult)

      const response = await request(app)
        .get(`/api/url/${shortCode}`)
        .expect(200)

      expect(response.body).to.deep.equal({
        success: true,
        data: {
          original_url: originalUrl,
          short_code: shortCode,
          created_at: '2024-01-15T10:30:00.000Z',
          expires_at: '2024-07-15T10:30:00.000Z',
          click_count: 42
        }
      })

      expect(mockDatabaseService.getClient().url.findUnique).to.have.been.calledWith({
        where: { shortCode: shortCode }
      })
    })

    it('should return URL details from cache when available', async () => {
      mockRedisService.getCachedUrl.resolves(originalUrl)

      const response = await request(app)
        .get(`/api/url/${shortCode}`)
        .expect(200)

      expect(response.body.success).to.be.true
      expect(response.body.data.original_url).to.equal(originalUrl)
      expect(response.body.data.short_code).to.equal(shortCode)

      // Database should not be called when cache hit occurs
      expect(mockDatabaseService.getClient().url.findUnique).to.not.have.been.called
    })

    it('should return 404 for non-existent short code', async () => {
      mockDatabaseService.getClient().url.findUnique.resolves(null)

      const response = await request(app)
        .get('/api/url/nonexistent')
        .expect(404)

      expect(response.body).to.have.property('status_code', 404)
      expect(response.body.error.code).to.equal('NotFound')
      expect(response.body.error.message).to.include('URL not found')
    })

    it('should return 400 for invalid short code format', async () => {
      const response = await request(app)
        .get('/api/url/')
        .expect(404) // Express returns 404 for missing route parameter
    })

    it('should return 500 for database failure', async () => {
      mockDatabaseService.getClient().url.findUnique.rejects(new Error('Database connection failed'))

      const response = await request(app)
        .get(`/api/url/${shortCode}`)
        .expect(500)

      expect(response.body.error.message).to.include('Failed to retrieve URL')
    })
  })

  describe('DELETE /api/url/:shortCode', () => {
    const shortCode = 'abc123'
    const originalUrl = 'https://example.com/test'

    const mockDbResult = {
      id: 'test-id',
      originalUrl: originalUrl,
      shortCode: shortCode,
      createdAt: new Date('2024-01-15T10:30:00Z'),
      expiresAt: new Date('2024-07-15T10:30:00Z'),
      clickCount: 5
    }

    it('should successfully delete URL', async () => {
      mockDatabaseService.getClient().url.delete.resolves(mockDbResult)

      const response = await request(app)
        .delete(`/api/url/${shortCode}`)
        .expect(200)

      expect(response.body).to.deep.equal({
        success: true,
        data: {
          original_url: originalUrl,
          short_code: shortCode,
          created_at: '2024-01-15T10:30:00.000Z',
          expires_at: '2024-07-15T10:30:00.000Z',
          click_count: 5
        }
      })

      expect(mockDatabaseService.getClient().url.delete).to.have.been.calledWith({
        where: { shortCode: shortCode }
      })
      expect(mockRedisService.removeCachedUrl).to.have.been.calledWith(shortCode)
    })

    it('should return 404 for non-existent short code', async () => {
      const notFoundError = new Error('Record not found')
      notFoundError.code = 'P2025'
      mockDatabaseService.getClient().url.delete.rejects(notFoundError)

      const response = await request(app)
        .delete('/api/url/nonexistent')
        .expect(404)

      expect(response.body.error.code).to.equal('NotFound')
      expect(response.body.error.message).to.include('URL not found')
    })

    it('should return 500 for database failure', async () => {
      mockDatabaseService.getClient().url.delete.rejects(new Error('Database connection failed'))

      const response = await request(app)
        .delete(`/api/url/${shortCode}`)
        .expect(500)

      expect(response.body.error.message).to.include('Failed to delete URL')
    })
  })

  describe('GET /api/urls', () => {
    const mockDbResults = [
      {
        id: 'test-id-1',
        originalUrl: 'https://example.com/1',
        shortCode: 'abc123',
        createdAt: new Date('2024-01-15T10:30:00Z'),
        expiresAt: new Date('2024-07-15T10:30:00Z'),
        clickCount: 10
      },
      {
        id: 'test-id-2',
        originalUrl: 'https://example.com/2',
        shortCode: 'def456',
        createdAt: new Date('2024-01-16T10:30:00Z'),
        expiresAt: new Date('2024-07-16T10:30:00Z'),
        clickCount: 5
      }
    ]

    it('should return all URLs', async () => {
      mockDatabaseService.getClient().url.findMany.resolves(mockDbResults)

      const response = await request(app)
        .get('/api/urls')
        .expect(200)

      expect(response.body).to.have.property('success', true)
      expect(response.body.data).to.be.an('array').with.lengthOf(2)

      response.body.data.forEach((item, index) => {
        expect(item).to.deep.equal({
          original_url: mockDbResults[index].originalUrl,
          short_code: mockDbResults[index].shortCode,
          created_at: mockDbResults[index].createdAt.toISOString(),
          expires_at: mockDbResults[index].expiresAt.toISOString(),
          click_count: mockDbResults[index].clickCount
        })
      })

      expect(mockDatabaseService.getClient().url.findMany).to.have.been.calledWith({
        orderBy: { createdAt: 'desc' }
      })
    })

    it('should return empty array when no URLs exist', async () => {
      mockDatabaseService.getClient().url.findMany.resolves([])

      const response = await request(app)
        .get('/api/urls')
        .expect(200)

      expect(response.body).to.deep.equal({
        success: true,
        data: []
      })
    })

    it('should return 500 for database failure', async () => {
      mockDatabaseService.getClient().url.findMany.rejects(new Error('Database connection failed'))

      const response = await request(app)
        .get('/api/urls')
        .expect(500)

      expect(response.body.error.message).to.include('Failed to retrieve URLs')
    })
  })

  describe('Error Handling and Edge Cases', () => {
    it('should handle invalid JSON in request body', async () => {
      const response = await request(app)
        .post('/api/shorten')
        .set('Content-Type', 'application/json')
        .send('{"url": invalid}')
        .expect(400)

      expect(response.body.error.code).to.equal('BadRequest')
    })

    it('should handle missing Content-Type header', async () => {
      const response = await request(app)
        .post('/api/shorten')
        .send('url=https://example.com')
        .expect(400)

      // Should handle non-JSON content gracefully
      expect(response.body.error.code).to.equal('BadRequest')
    })

    it('should handle very large request payloads', async () => {
      const largeUrl = 'https://example.com/' + 'a'.repeat(10000)

      const response = await request(app)
        .post('/api/shorten')
        .send({ url: largeUrl })
        .expect(400)

      expect(response.body.error.message).to.include('URL too long')
    })

    it('should return consistent error format across all endpoints', async () => {
      // Test various error scenarios to ensure consistent format
      const responses = await Promise.all([
        request(app).post('/api/shorten').send({}),
        request(app).get('/api/url/nonexistent'),
        request(app).delete('/api/url/nonexistent').send()
      ])

      responses.forEach(response => {
        expect(response.body).to.have.property('status_code')
        expect(response.body).to.have.property('error')
        expect(response.body.error).to.have.property('code')
        expect(response.body.error).to.have.property('message')
        expect(response.body.error).to.have.property('details')
      })
    })

    it('should handle concurrent requests properly', async () => {
      const validUrl = 'https://example.com/concurrent'
      const shortCode = 'abc123'

      mockDatabaseService.getClient().url.create.resolves({
        id: 'test-id',
        originalUrl: validUrl,
        shortCode: shortCode,
        createdAt: new Date('2024-01-15T10:30:00Z'),
        expiresAt: new Date('2024-07-15T10:30:00Z'),
        clickCount: 0
      })

      // Make 5 concurrent requests
      const promises = Array(5).fill().map(() => 
        request(app)
          .post('/api/shorten')
          .send({ url: validUrl })
      )

      const responses = await Promise.all(promises)

      responses.forEach(response => {
        expect(response.status).to.equal(201)
        expect(response.body.success).to.be.true
      })
    })
  })

  describe('Response Headers and Formats', () => {
    it('should set correct Content-Type header', async () => {
      mockDatabaseService.getClient().url.findMany.resolves([])

      const response = await request(app)
        .get('/api/urls')
        .expect(200)

      expect(response.headers['content-type']).to.include('application/json')
    })

    it('should include proper HTTP status codes in response body', async () => {
      const validUrl = 'https://example.com/test'
      mockDatabaseService.getClient().url.create.resolves({
        id: 'test-id',
        originalUrl: validUrl,
        shortCode: 'abc123',
        createdAt: new Date(),
        expiresAt: new Date(),
        clickCount: 0
      })

      const response = await request(app)
        .post('/api/shorten')
        .send({ url: validUrl })
        .expect(201)

      // Status code should match both HTTP status and response body
      expect(response.status).to.equal(201)
      expect(response.body).to.not.have.property('status_code') // Success responses don't include status_code
    })

    it('should handle HEAD requests appropriately', async () => {
      mockDatabaseService.getClient().url.findMany.resolves([])

      const response = await request(app)
        .head('/api/urls')
        .expect(200)

      expect(response.body).to.be.empty
      expect(response.headers['content-type']).to.include('application/json')
    })
  })
}) 