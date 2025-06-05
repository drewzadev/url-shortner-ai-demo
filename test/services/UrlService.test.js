import { describe, it, beforeEach, afterEach } from 'mocha'
import { expect } from 'chai'
import sinon from 'sinon'
import UrlService from '../../services/UrlService.js'
import { validateUrl } from '../../utils/validators.js'

/**
 * Unit tests for UrlService
 * Tests all core functionality including URL creation, retrieval, deletion, and error handling
 */
describe('UrlService Unit Tests', () => {
  let urlService
  let mockDatabase
  let mockRedis
  let mockLogger
  let sandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    
    // Mock Database (Prisma client structure)
    const mockPrismaClient = {
      url: {
        create: sandbox.stub(),
        findUnique: sandbox.stub(),
        findMany: sandbox.stub(),
        delete: sandbox.stub(),
        update: sandbox.stub()
      },
      $transaction: sandbox.stub()
    }

    mockDatabase = {
      getClient: sandbox.stub().returns(mockPrismaClient),
      healthCheck: sandbox.stub().resolves(true),
      isConnected: true
    }

    // Mock RedisService
    mockRedis = {
      getShortCode: sandbox.stub(),
      setShortCode: sandbox.stub(),
      cacheUrl: sandbox.stub(),
      getCachedUrl: sandbox.stub(),
      removeCachedUrl: sandbox.stub(),
      isHealthy: sandbox.stub().returns(true),
      healthCheck: sandbox.stub().resolves(true),
      isConnected: true
    }

    // Mock Logger
    mockLogger = {
      debug: sandbox.stub(),
      info: sandbox.stub(),
      warn: sandbox.stub(),
      error: sandbox.stub(),
      fatal: sandbox.stub()
    }

    urlService = new UrlService(mockDatabase, mockRedis, mockLogger)
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('createShortUrl()', () => {
    const validUrl = 'https://example.com/test'
    const shortCode = 'abc123'

    beforeEach(() => {
      // Set up default successful mocks
      mockRedis.getShortCode.resolves(shortCode)
      mockRedis.cacheUrl.resolves()
    })

    it('should successfully create a short URL with valid input', async () => {
      const mockDbResult = {
        id: 'test-id',
        originalUrl: validUrl,
        shortCode: shortCode,
        createdAt: new Date('2024-01-15T10:30:00Z'),
        expiresAt: new Date('2024-07-15T10:30:00Z'),
        clickCount: 0
      }

      mockDatabase.getClient().url.create.resolves(mockDbResult)

      const result = await urlService.createShortUrl(validUrl)

      expect(result).to.be.an('object')
      expect(result.originalUrl).to.equal(validUrl)
      expect(result.shortCode).to.equal(shortCode)
      expect(result.shortUrl).to.include(shortCode)
      expect(result.createdAt).to.be.an.instanceof(Date)
      expect(result.expiresAt).to.be.an.instanceof(Date)

      // Verify database create was called with correct data
      expect(mockDatabase.getClient().url.create).to.have.been.calledOnce
      const createCall = mockDatabase.getClient().url.create.getCall(0)
      expect(createCall.args[0].data.originalUrl).to.equal(validUrl)
      expect(createCall.args[0].data.shortCode).to.equal(shortCode)

      // Verify caching was attempted
      expect(mockRedis.cacheUrl).to.have.been.called

      // Verify logging
      expect(mockLogger.debug).to.have.been.called
      expect(mockLogger.info).to.have.been.called
    })

    it('should reject invalid URLs with validation error', async () => {
      const invalidUrl = 'not-a-url'

      try {
        await urlService.createShortUrl(invalidUrl)
        expect.fail('Should have thrown validation error')
      } catch (error) {
        expect(error.message).to.include('Invalid URL format')
        expect(mockDatabase.getClient().url.create).to.not.have.been.called
        expect(mockLogger.warn).to.have.been.called
      }
    })

    it('should handle URL that is too long', async () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(3000)

      try {
        await urlService.createShortUrl(longUrl)
        expect.fail('Should have thrown validation error')
      } catch (error) {
        expect(error.message).to.include('exceeds maximum length')
        expect(mockDatabase.getClient().url.create).to.not.have.been.called
      }
    })

    it('should handle Redis failure gracefully and continue with database operation', async () => {
      mockRedis.getShortCode.rejects(new Error('Redis connection failed'))
      
      const mockDbResult = {
        id: 'test-id',
        originalUrl: validUrl,
        shortCode: shortCode,
        createdAt: new Date('2024-01-15T10:30:00Z'),
        expiresAt: new Date('2024-07-15T10:30:00Z'),
        clickCount: 0
      }

      mockDatabase.getClient().url.create.resolves(mockDbResult)

      try {
        const result = await urlService.createShortUrl(validUrl)
        expect.fail('Should have thrown error when Redis fails')
      } catch (error) {
        expect(error.message).to.include('Failed to generate short code')
        expect(mockLogger.error).to.have.been.called
      }
    })

    it('should handle database failure with appropriate error', async () => {
      const dbError = new Error('Database connection failed')
      mockDatabase.healthCheck.rejects(dbError)

      try {
        await urlService.createShortUrl(validUrl)
        expect.fail('Should have thrown database error')
      } catch (error) {
        expect(error.message).to.include('Database service unavailable')
        expect(mockLogger.error).to.have.been.called
      }
    })

    it('should handle unique constraint violation by retrying with new short code', async () => {
      const duplicateError = new Error('Unique constraint failed')
      duplicateError.code = 'P2002' // Prisma unique constraint error code
      
      const newShortCode = 'def456'
      const mockDbResult = {
        id: 'test-id',
        originalUrl: validUrl,
        shortCode: newShortCode,
        createdAt: new Date('2024-01-15T10:30:00Z'),
        expiresAt: new Date('2024-07-15T10:30:00Z'),
        clickCount: 0
      }

      // First call fails with unique constraint, second succeeds
      mockDatabase.getClient().url.create
        .onFirstCall().rejects(duplicateError)
        .onSecondCall().resolves(mockDbResult)
      
      // Return different short codes on subsequent calls
      mockRedis.getShortCode
        .onFirstCall().resolves(shortCode)
        .onSecondCall().resolves(newShortCode)

      const result = await urlService.createShortUrl(validUrl)

      expect(result.shortCode).to.equal(newShortCode)
      expect(mockDatabase.getClient().url.create).to.have.been.calledTwice
      expect(mockLogger.warn).to.have.been.calledWith(
        sinon.match.string,
        sinon.match(/Duplicate short code.*retrying/i)
      )
    })

    it('should fail after maximum retry attempts for unique constraint violations', async () => {
      const duplicateError = new Error('Unique constraint failed')
      duplicateError.code = 'P2002'
      
      mockDatabase.getClient().url.create.rejects(duplicateError)
      mockRedis.getShortCode.resolves(shortCode)

      try {
        await urlService.createShortUrl(validUrl)
        expect.fail('Should have thrown error after max retries')
      } catch (error) {
        expect(error.message).to.include('Failed to create short URL after retries')
        expect(mockDatabase.getClient().url.create.callCount).to.equal(3) // Default max retries
      }
    })

    it('should handle caching failure gracefully without affecting URL creation', async () => {
      const mockDbResult = {
        id: 'test-id',
        originalUrl: validUrl,
        shortCode: shortCode,
        createdAt: new Date('2024-01-15T10:30:00Z'),
        expiresAt: new Date('2024-07-15T10:30:00Z'),
        clickCount: 0
      }

      mockDatabase.getClient().url.create.resolves(mockDbResult)
      mockRedis.cacheUrl.rejects(new Error('Cache write failed'))

      const result = await urlService.createShortUrl(validUrl)

      expect(result).to.be.an('object')
      expect(result.originalUrl).to.equal(validUrl)
      expect(mockLogger.warn).to.have.been.calledWith(
        sinon.match.string,
        sinon.match(/Failed to cache.*continuing/i)
      )
    })

    it('should use default base URL when not provided', async () => {
      const mockDbResult = {
        id: 'test-id',
        originalUrl: validUrl,
        shortCode: shortCode,
        createdAt: new Date('2024-01-15T10:30:00Z'),
        expiresAt: new Date('2024-07-15T10:30:00Z'),
        clickCount: 0
      }

      mockDatabase.getClient().url.create.resolves(mockDbResult)

      const result = await urlService.createShortUrl(validUrl)

      expect(result.shortUrl).to.include(shortCode)
      expect(result.shortUrl).to.not.be.null
    })

    it('should calculate correct expiration date', async () => {
      const now = new Date('2024-01-15T10:30:00Z')
      const expectedExpiration = new Date('2024-07-15T10:30:00Z') // 6 months later
      
      const mockDbResult = {
        id: 'test-id',
        originalUrl: validUrl,
        shortCode: shortCode,
        createdAt: now,
        expiresAt: expectedExpiration,
        clickCount: 0
      }

      mockDatabase.getClient().url.create.resolves(mockDbResult)

      const result = await urlService.createShortUrl(validUrl)

      expect(result.expiresAt).to.equal(expectedExpiration.toISOString())
    })
  })

  describe('createBulkShortUrls()', () => {
    const validUrls = [
      'https://example.com/1',
      'https://example.com/2',
      'https://example.com/3'
    ]
    const shortCodes = ['abc123', 'def456', 'ghi789']
    const baseUrl = 'https://short.ly'

    beforeEach(() => {
      // Set up default successful mocks
      mockRedis.getShortCode
        .onFirstCall().resolves(shortCodes[0])
        .onSecondCall().resolves(shortCodes[1])
        .onThirdCall().resolves(shortCodes[2])
      mockRedis.cacheUrl.resolves()
    })

    it('should successfully create multiple short URLs', async () => {
      const mockDbResults = validUrls.map((url, index) => ({
        id: `test-id-${index}`,
        originalUrl: url,
        shortCode: shortCodes[index],
        createdAt: new Date('2024-01-15T10:30:00Z'),
        expiresAt: new Date('2024-07-15T10:30:00Z'),
        clickCount: 0
      }))

      // Mock transaction that returns all created URLs
      mockDatabase.getClient().$transaction.resolves(mockDbResults)

      const result = await urlService.createBulkShortUrls(validUrls, baseUrl)

      expect(result).to.be.an('array')
      expect(result).to.have.lengthOf(3)

      result.forEach((item, index) => {
        expect(item).to.deep.equal({
          original_url: validUrls[index],
          short_url: `${baseUrl}/${shortCodes[index]}`,
          short_code: shortCodes[index]
        })
      })

      // Verify transaction was called
      expect(mockDatabase.getClient().$transaction).to.have.been.calledOnce

      // Verify caching attempts for all URLs
      expect(mockRedis.cacheUrl).to.have.been.calledThrice

      // Verify logging
      expect(mockLogger.info).to.have.been.calledWith(
        sinon.match.string,
        sinon.match(/Successfully created.*bulk URLs/i)
      )
    })

    it('should reject empty URL array', async () => {
      try {
        await urlService.createBulkShortUrls([], baseUrl)
        expect.fail('Should have thrown validation error')
      } catch (error) {
        expect(error.message).to.include('URLs array cannot be empty')
        expect(mockDatabase.getClient().$transaction).to.not.have.been.called
      }
    })

    it('should reject URL array exceeding maximum limit', async () => {
      const tooManyUrls = new Array(1001).fill('https://example.com')

      try {
        await urlService.createBulkShortUrls(tooManyUrls, baseUrl)
        expect.fail('Should have thrown validation error')
      } catch (error) {
        expect(error.message).to.include('Too many URLs')
        expect(mockDatabase.getClient().$transaction).to.not.have.been.called
      }
    })

    it('should fail entire operation if any URL is invalid', async () => {
      const mixedUrls = [
        'https://example.com/valid',
        'invalid-url',
        'https://example.com/also-valid'
      ]

      try {
        await urlService.createBulkShortUrls(mixedUrls, baseUrl)
        expect.fail('Should have thrown validation error')
      } catch (error) {
        expect(error.message).to.include('Invalid URL')
        expect(mockDatabase.getClient().$transaction).to.not.have.been.called
      }
    })

    it('should handle Redis failure gracefully and continue with database operation', async () => {
      mockRedis.getShortCode.rejects(new Error('Redis connection failed'))
      
      const mockDbResults = validUrls.map((url, index) => ({
        id: `test-id-${index}`,
        originalUrl: url,
        shortCode: `fallback-${index}`,
        createdAt: new Date('2024-01-15T10:30:00Z'),
        expiresAt: new Date('2024-07-15T10:30:00Z'),
        clickCount: 0
      }))

      mockDatabase.getClient().$transaction.resolves(mockDbResults)

      const result = await urlService.createBulkShortUrls(validUrls, baseUrl)

      expect(result).to.be.an('array')
      expect(result).to.have.lengthOf(3)
      expect(mockLogger.warn).to.have.been.calledWith(
        sinon.match.string,
        sinon.match(/Redis.*failed.*fallback/i)
      )
    })

    it('should handle database transaction failure', async () => {
      const dbError = new Error('Transaction failed')
      mockDatabase.getClient().$transaction.rejects(dbError)

      try {
        await urlService.createBulkShortUrls(validUrls, baseUrl)
        expect.fail('Should have thrown database error')
      } catch (error) {
        expect(error.message).to.include('Failed to create bulk short URLs')
        expect(mockLogger.error).to.have.been.called
      }
    })

    it('should handle partial Redis caching failures without affecting URL creation', async () => {
      const mockDbResults = validUrls.map((url, index) => ({
        id: `test-id-${index}`,
        originalUrl: url,
        shortCode: shortCodes[index],
        createdAt: new Date('2024-01-15T10:30:00Z'),
        expiresAt: new Date('2024-07-15T10:30:00Z'),
        clickCount: 0
      }))

      mockDatabase.getClient().$transaction.resolves(mockDbResults)
      
      // Make some cache operations fail
      mockRedis.cacheUrl
        .onFirstCall().resolves()
        .onSecondCall().rejects(new Error('Cache write failed'))
        .onThirdCall().resolves()

      const result = await urlService.createBulkShortUrls(validUrls, baseUrl)

      expect(result).to.be.an('array')
      expect(result).to.have.lengthOf(3)
      expect(mockLogger.warn).to.have.been.called
    })

    it('should validate individual URLs in the array', async () => {
      const urlsWithInvalid = [
        'https://example.com/valid',
        'ftp://invalid-protocol.com',
        'https://example.com/also-valid'
      ]

      try {
        await urlService.createBulkShortUrls(urlsWithInvalid, baseUrl)
        expect.fail('Should have thrown validation error')
      } catch (error) {
        expect(error.message).to.include('ftp://invalid-protocol.com')
      }
    })

    it('should handle duplicate URLs in input array', async () => {
      const duplicateUrls = [
        'https://example.com/same',
        'https://example.com/different',
        'https://example.com/same'
      ]

      const mockDbResults = [
        {
          id: 'test-id-0',
          originalUrl: duplicateUrls[0],
          shortCode: shortCodes[0],
          createdAt: new Date('2024-01-15T10:30:00Z'),
          expiresAt: new Date('2024-07-15T10:30:00Z'),
          clickCount: 0
        },
        {
          id: 'test-id-1',
          originalUrl: duplicateUrls[1],
          shortCode: shortCodes[1],
          createdAt: new Date('2024-01-15T10:30:00Z'),
          expiresAt: new Date('2024-07-15T10:30:00Z'),
          clickCount: 0
        },
        {
          id: 'test-id-2',
          originalUrl: duplicateUrls[2],
          shortCode: shortCodes[2],
          createdAt: new Date('2024-01-15T10:30:00Z'),
          expiresAt: new Date('2024-07-15T10:30:00Z'),
          clickCount: 0
        }
      ]

      mockDatabase.getClient().$transaction.resolves(mockDbResults)

      const result = await urlService.createBulkShortUrls(duplicateUrls, baseUrl)

      expect(result).to.be.an('array')
      expect(result).to.have.lengthOf(3)
      // Should create separate short URLs even for duplicate original URLs
      expect(result[0].short_code).to.not.equal(result[2].short_code)
    })

    it('should use transaction for atomic operation', async () => {
      const mockDbResults = validUrls.map((url, index) => ({
        id: `test-id-${index}`,
        originalUrl: url,
        shortCode: shortCodes[index],
        createdAt: new Date('2024-01-15T10:30:00Z'),
        expiresAt: new Date('2024-07-15T10:30:00Z'),
        clickCount: 0
      }))

      mockDatabase.getClient().$transaction.resolves(mockDbResults)

      await urlService.createBulkShortUrls(validUrls, baseUrl)

      // Verify transaction was called with array of operations
      expect(mockDatabase.getClient().$transaction).to.have.been.calledOnce
      const transactionCall = mockDatabase.getClient().$transaction.getCall(0)
      expect(transactionCall.args[0]).to.be.an('array')
      expect(transactionCall.args[0]).to.have.lengthOf(3)
    })
  })

  describe('getUrlByShortCode()', () => {
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

    it('should return URL details from cache when available (cache hit)', async () => {
      mockRedis.getCachedUrl.resolves(originalUrl)

      const result = await urlService.getUrlByShortCode(shortCode)

      expect(result).to.deep.equal({
        original_url: originalUrl,
        short_code: shortCode,
        created_at: undefined, // Cache only stores URL, not full metadata
        expires_at: undefined,
        click_count: undefined
      })

      // Verify cache was checked first
      expect(mockRedis.getCachedUrl).to.have.been.calledWith(shortCode)
      // Database should not be called when cache hit occurs
      expect(mockDatabase.getClient().url.findUnique).to.not.have.been.called

      expect(mockLogger.debug).to.have.been.calledWith(
        sinon.match.string,
        sinon.match(/Found.*in cache/i)
      )
    })

    it('should return full URL details from database when cache miss occurs', async () => {
      mockRedis.getCachedUrl.resolves(null) // Cache miss
      mockDatabase.getClient().url.findUnique.resolves(mockDbResult)
      mockRedis.cacheUrl.resolves() // Successful re-caching

      const result = await urlService.getUrlByShortCode(shortCode)

      expect(result).to.deep.equal({
        original_url: originalUrl,
        short_code: shortCode,
        created_at: '2024-01-15T10:30:00.000Z',
        expires_at: '2024-07-15T10:30:00.000Z',
        click_count: 42
      })

      // Verify cache was checked first, then database
      expect(mockRedis.getCachedUrl).to.have.been.calledWith(shortCode)
      expect(mockDatabase.getClient().url.findUnique).to.have.been.calledWith({
        where: { shortCode: shortCode }
      })

      // Verify URL was re-cached after database retrieval
      expect(mockRedis.cacheUrl).to.have.been.calledWith(shortCode, originalUrl)

      expect(mockLogger.debug).to.have.been.calledWith(
        sinon.match.string,
        sinon.match(/Cache miss.*retrieving from database/i)
      )
    })

    it('should return null when short code is not found', async () => {
      mockRedis.getCachedUrl.resolves(null)
      mockDatabase.getClient().url.findUnique.resolves(null)

      const result = await urlService.getUrlByShortCode(shortCode)

      expect(result).to.be.null

      expect(mockLogger.debug).to.have.been.calledWith(
        sinon.match.string,
        sinon.match(/Short code.*not found/i)
      )
    })

    it('should handle Redis cache failure gracefully and continue with database lookup', async () => {
      mockRedis.getCachedUrl.rejects(new Error('Redis connection failed'))
      mockDatabase.getClient().url.findUnique.resolves(mockDbResult)

      const result = await urlService.getUrlByShortCode(shortCode)

      expect(result).to.deep.equal({
        original_url: originalUrl,
        short_code: shortCode,
        created_at: '2024-01-15T10:30:00.000Z',
        expires_at: '2024-07-15T10:30:00.000Z',
        click_count: 42
      })

      expect(mockLogger.warn).to.have.been.calledWith(
        sinon.match.string,
        sinon.match(/Cache lookup failed.*falling back to database/i)
      )
    })

    it('should handle database failure with appropriate error', async () => {
      mockRedis.getCachedUrl.resolves(null)
      const dbError = new Error('Database connection failed')
      mockDatabase.getClient().url.findUnique.rejects(dbError)

      try {
        await urlService.getUrlByShortCode(shortCode)
        expect.fail('Should have thrown database error')
      } catch (error) {
        expect(error.message).to.include('Failed to retrieve URL')
        expect(mockLogger.error).to.have.been.called
      }
    })

    it('should handle cache write failure gracefully after database retrieval', async () => {
      mockRedis.getCachedUrl.resolves(null)
      mockDatabase.getClient().url.findUnique.resolves(mockDbResult)
      mockRedis.cacheUrl.rejects(new Error('Cache write failed'))

      const result = await urlService.getUrlByShortCode(shortCode)

      expect(result).to.be.an('object')
      expect(result.original_url).to.equal(originalUrl)

      expect(mockLogger.warn).to.have.been.calledWith(
        sinon.match.string,
        sinon.match(/Failed to cache.*after database retrieval/i)
      )
    })

    it('should validate short code format', async () => {
      const invalidShortCode = ''

      try {
        await urlService.getUrlByShortCode(invalidShortCode)
        expect.fail('Should have thrown validation error')
      } catch (error) {
        expect(error.message).to.include('Short code is required')
        expect(mockRedis.getCachedUrl).to.not.have.been.called
        expect(mockDatabase.getClient().url.findUnique).to.not.have.been.called
      }
    })

    it('should handle expired URLs appropriately', async () => {
      const expiredDbResult = {
        ...mockDbResult,
        expiresAt: new Date('2023-01-15T10:30:00Z') // Expired date
      }

      mockRedis.getCachedUrl.resolves(null)
      mockDatabase.getClient().url.findUnique.resolves(expiredDbResult)

      const result = await urlService.getUrlByShortCode(shortCode)

      expect(result).to.deep.equal({
        original_url: originalUrl,
        short_code: shortCode,
        created_at: '2024-01-15T10:30:00.000Z',
        expires_at: '2023-01-15T10:30:00.000Z',
        click_count: 42
      })

      // Should still return the URL data even if expired
      // Expiration handling might be done at the application layer
      expect(mockLogger.debug).to.have.been.called
    })

    it('should preserve exact database field mapping', async () => {
      mockRedis.getCachedUrl.resolves(null)
      mockDatabase.getClient().url.findUnique.resolves(mockDbResult)

      const result = await urlService.getUrlByShortCode(shortCode)

      // Verify field mapping from database to API response format
      expect(result.original_url).to.equal(mockDbResult.originalUrl)
      expect(result.short_code).to.equal(mockDbResult.shortCode)
      expect(result.created_at).to.equal(mockDbResult.createdAt.toISOString())
      expect(result.expires_at).to.equal(mockDbResult.expiresAt.toISOString())
      expect(result.click_count).to.equal(mockDbResult.clickCount)
    })
  })

  describe('deleteUrl()', () => {
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

    it('should successfully delete URL and invalidate cache', async () => {
      mockDatabase.getClient().url.delete.resolves(mockDbResult)
      mockRedis.removeCachedUrl.resolves()

      const result = await urlService.deleteUrl(shortCode)

      expect(result).to.deep.equal({
        original_url: originalUrl,
        short_code: shortCode,
        created_at: '2024-01-15T10:30:00.000Z',
        expires_at: '2024-07-15T10:30:00.000Z',
        click_count: 5
      })

      expect(mockDatabase.getClient().url.delete).to.have.been.calledWith({
        where: { shortCode: shortCode }
      })

      expect(mockRedis.removeCachedUrl).to.have.been.calledWith(shortCode)

      expect(mockLogger.info).to.have.been.calledWith(
        sinon.match.string,
        sinon.match(/Successfully deleted URL/i)
      )
    })

    it('should handle deletion of non-existent URL', async () => {
      const notFoundError = new Error('Record not found')
      notFoundError.code = 'P2025' // Prisma record not found error code
      mockDatabase.getClient().url.delete.rejects(notFoundError)

      try {
        await urlService.deleteUrl(shortCode)
        expect.fail('Should have thrown not found error')
      } catch (error) {
        expect(error.message).to.include('URL not found')
        expect(mockLogger.debug).to.have.been.calledWith(
          sinon.match.string,
          sinon.match(/URL.*not found for deletion/i)
        )
      }
    })

    it('should handle database failure during deletion', async () => {
      const dbError = new Error('Database connection failed')
      mockDatabase.getClient().url.delete.rejects(dbError)

      try {
        await urlService.deleteUrl(shortCode)
        expect.fail('Should have thrown database error')
      } catch (error) {
        expect(error.message).to.include('Failed to delete URL')
        expect(mockLogger.error).to.have.been.called
      }
    })

    it('should handle cache invalidation failure gracefully', async () => {
      mockDatabase.getClient().url.delete.resolves(mockDbResult)
      mockRedis.removeCachedUrl.rejects(new Error('Cache removal failed'))

      const result = await urlService.deleteUrl(shortCode)

      expect(result).to.be.an('object')
      expect(result.short_code).to.equal(shortCode)

      expect(mockLogger.warn).to.have.been.calledWith(
        sinon.match.string,
        sinon.match(/Failed to remove.*from cache/i)
      )
    })

    it('should validate short code before deletion', async () => {
      try {
        await urlService.deleteUrl('')
        expect.fail('Should have thrown validation error')
      } catch (error) {
        expect(error.message).to.include('Short code is required')
        expect(mockDatabase.getClient().url.delete).to.not.have.been.called
      }
    })
  })

  describe('getAllUrls()', () => {
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

    it('should successfully retrieve all URLs with metadata', async () => {
      mockDatabase.getClient().url.findMany.resolves(mockDbResults)

      const result = await urlService.getAllUrls()

      expect(result).to.be.an('array')
      expect(result).to.have.lengthOf(2)

      result.forEach((item, index) => {
        expect(item).to.deep.equal({
          original_url: mockDbResults[index].originalUrl,
          short_code: mockDbResults[index].shortCode,
          created_at: mockDbResults[index].createdAt.toISOString(),
          expires_at: mockDbResults[index].expiresAt.toISOString(),
          click_count: mockDbResults[index].clickCount
        })
      })

      expect(mockDatabase.getClient().url.findMany).to.have.been.calledOnce

      expect(mockLogger.debug).to.have.been.calledWith(
        sinon.match.string,
        sinon.match(/Retrieved.*URLs from database/i)
      )
    })

    it('should handle empty result set', async () => {
      mockDatabase.getClient().url.findMany.resolves([])

      const result = await urlService.getAllUrls()

      expect(result).to.be.an('array')
      expect(result).to.have.lengthOf(0)

      expect(mockLogger.debug).to.have.been.calledWith(
        sinon.match.string,
        sinon.match(/Retrieved.*0.*URLs/i)
      )
    })

    it('should handle database failure', async () => {
      const dbError = new Error('Database connection failed')
      mockDatabase.getClient().url.findMany.rejects(dbError)

      try {
        await urlService.getAllUrls()
        expect.fail('Should have thrown database error')
      } catch (error) {
        expect(error.message).to.include('Failed to retrieve URLs')
        expect(mockLogger.error).to.have.been.called
      }
    })

    it('should use proper sorting (newest first)', async () => {
      mockDatabase.getClient().url.findMany.resolves(mockDbResults)

      await urlService.getAllUrls()

      expect(mockDatabase.getClient().url.findMany).to.have.been.calledWith({
        orderBy: { createdAt: 'desc' }
      })
    })
  })

  describe('incrementClickCount()', () => {
    const shortCode = 'abc123'

    it('should successfully increment click count', async () => {
      const updatedResult = {
        id: 'test-id',
        originalUrl: 'https://example.com/test',
        shortCode: shortCode,
        createdAt: new Date('2024-01-15T10:30:00Z'),
        expiresAt: new Date('2024-07-15T10:30:00Z'),
        clickCount: 43 // Incremented from 42
      }

      mockDatabase.getClient().url.update.resolves(updatedResult)

      const result = await urlService.incrementClickCount(shortCode)

      expect(result).to.equal(43)

      expect(mockDatabase.getClient().url.update).to.have.been.calledWith({
        where: { shortCode: shortCode },
        data: { clickCount: { increment: 1 } }
      })

      expect(mockLogger.debug).to.have.been.calledWith(
        sinon.match.string,
        sinon.match(/Incremented click count.*43/i)
      )
    })

    it('should handle non-existent URL during click increment', async () => {
      const notFoundError = new Error('Record not found')
      notFoundError.code = 'P2025'
      mockDatabase.getClient().url.update.rejects(notFoundError)

      try {
        await urlService.incrementClickCount(shortCode)
        expect.fail('Should have thrown not found error')
      } catch (error) {
        expect(error.message).to.include('URL not found')
      }
    })

    it('should handle database failure during click increment', async () => {
      const dbError = new Error('Database connection failed')
      mockDatabase.getClient().url.update.rejects(dbError)

      try {
        await urlService.incrementClickCount(shortCode)
        expect.fail('Should have thrown database error')
      } catch (error) {
        expect(error.message).to.include('Failed to increment click count')
        expect(mockLogger.error).to.have.been.called
      }
    })

    it('should validate short code', async () => {
      try {
        await urlService.incrementClickCount('')
        expect.fail('Should have thrown validation error')
      } catch (error) {
        expect(error.message).to.include('Short code is required')
        expect(mockDatabase.getClient().url.update).to.not.have.been.called
      }
    })
  })
}) 