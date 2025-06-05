import { describe, it, beforeEach } from 'mocha'
import { expect } from 'chai'
import { 
  validateUrl, 
  validateUrlLength, 
  validateBulkUrls, 
  validateRequestSize, 
  validateShortCode,
  createValidationErrorResponse 
} from '../../utils/validators.js'

/**
 * Unit tests for URL validation utilities
 * Tests various valid and invalid URL formats and edge cases
 */
describe('URL Validators Unit Tests', () => {
  describe('validateUrl()', () => {
    describe('Valid URLs', () => {
      const validUrls = [
        'https://example.com',
        'http://example.com',
        'https://www.example.com',
        'http://www.example.com',
        'https://example.com/',
        'https://example.com/path',
        'https://example.com/path/to/resource',
        'https://example.com/path?query=value',
        'https://example.com/path?query=value&another=param',
        'https://example.com/path#fragment',
        'https://example.com/path?query=value#fragment',
        'https://subdomain.example.com',
        'https://sub.domain.example.com',
        'https://example.co.uk',
        'https://example.org',
        'https://example.net',
        'https://example.com:8080',
        'https://example.com/path/with-dashes',
        'https://example.com/path/with_underscores',
        'https://example.com/path/with.dots',
        'https://example.com/path/with%20encoded%20spaces',
        'https://user@example.com',
        'https://user:pass@example.com',
        'https://example.com/very/long/path/that/goes/on/and/on/for/a/while'
      ]

      validUrls.forEach(url => {
        it(`should accept valid URL: ${url}`, () => {
          const result = validateUrl(url, { allowLocalhost: true, allowIpAddresses: true })
          expect(result.isValid).to.be.true
          expect(result.error).to.be.undefined
        })
      })
    })

    describe('Invalid URLs', () => {
      const invalidUrls = [
        '',
        '   ',
        'not-a-url',
        'ftp://example.com',
        'file:///local/file',
        'mailto:test@example.com',
        'javascript:alert("xss")',
        'data:text/plain;base64,SGVsbG8=',
        'http://',
        'https://',
        'http:///',
        'https:///',
        '//example.com'
      ]

      invalidUrls.forEach(url => {
        it(`should reject invalid URL: ${url}`, () => {
          const result = validateUrl(url)
          expect(result.isValid).to.be.false
          expect(result.error).to.be.a('string')
          expect(result.details).to.be.an('array')
        })
      })
    })

    describe('URL Length Validation', () => {
      it('should reject URLs exceeding default length limit (2048 characters)', () => {
        const longUrl = 'https://example.com/' + 'a'.repeat(2100)
        const result = validateUrl(longUrl)
        
        expect(result.isValid).to.be.false
        expect(result.error).to.include('exceeds maximum length')
        expect(result.details).to.be.an('array')
      })

      it('should reject URLs exceeding custom length limit', () => {
        const mediumUrl = 'https://example.com/' + 'a'.repeat(500)
        const result = validateUrl(mediumUrl, { maxLength: 100 })
        
        expect(result.isValid).to.be.false
        expect(result.error).to.include('exceeds maximum length')
        expect(result.details).to.be.an('array')
      })

      it('should accept URLs within length limits', () => {
        const validUrl = 'https://example.com/short'
        const result = validateUrl(validUrl, { maxLength: 100 })
        
        expect(result.isValid).to.be.true
      })
    })

    describe('Edge Cases', () => {
      it('should handle null and undefined input', () => {
        expect(validateUrl(null).isValid).to.be.false
        expect(validateUrl(undefined).isValid).to.be.false
        expect(validateUrl().isValid).to.be.false
      })

      it('should handle non-string input', () => {
        expect(validateUrl(123).isValid).to.be.false
        expect(validateUrl({}).isValid).to.be.false
        expect(validateUrl([]).isValid).to.be.false
      })

      it('should handle very short URLs', () => {
        const shortUrl = 'http://a.b'
        const result = validateUrl(shortUrl)
        
        expect(result.isValid).to.be.true
      })
    })

    describe('Configuration Options', () => {
      it('should respect allowLocalhost option when false', () => {
        const localhostUrl = 'http://localhost:3000'
        const result = validateUrl(localhostUrl, { allowLocalhost: false })
        
        expect(result.isValid).to.be.false
        expect(result.error).to.include('localhost')
      })

      it('should respect allowIpAddresses option when false', () => {
        const ipUrl = 'http://192.168.1.1'
        const result = validateUrl(ipUrl, { allowIpAddresses: false })
        
        expect(result.isValid).to.be.false
        expect(result.error).to.include('IP address')
      })

      it('should allow localhost when allowLocalhost is true', () => {
        const localhostUrl = 'http://localhost:3000'
        const result = validateUrl(localhostUrl, { allowLocalhost: true })
        
        expect(result.isValid).to.be.true
      })

      it('should allow IP addresses when allowIpAddresses is true', () => {
        const ipUrl = 'http://192.168.1.1'
        const result = validateUrl(ipUrl, { allowIpAddresses: true })
        
        expect(result.isValid).to.be.true
      })
    })
  })

  describe('validateBulkUrls()', () => {
    it('should validate array of valid URLs', () => {
      const urls = [
        'https://example.com',
        'https://google.com',
        'https://github.com'
      ]
      const result = validateBulkUrls(urls)
      
      expect(result.isValid).to.be.true
    })

    it('should reject empty array', () => {
      const result = validateBulkUrls([])
      
      expect(result.isValid).to.be.false
      expect(result.error).to.include('cannot be empty')
    })

    it('should reject non-array input', () => {
      const urls = 'not-an-array'
      const result = validateBulkUrls(urls)
      
      expect(result.isValid).to.be.false
      expect(result.error).to.include('must be provided as an array')
    })

    it('should validate mixed valid and invalid URLs', () => {
      const urls = [
        'https://example.com',
        'invalid-url',
        'https://github.com',
        ''
      ]
      const result = validateBulkUrls(urls)
      
      expect(result.isValid).to.be.false
      expect(result.failedUrls).to.have.length(2)
    })

    it('should reject array exceeding maximum count', () => {
      const urls = new Array(1001).fill('https://example.com')
      const result = validateBulkUrls(urls, { maxCount: 1000 })
      
      expect(result.isValid).to.be.false
      expect(result.error).to.include('limited to 1000 URLs')
    })

    it('should validate array with custom options', () => {
      const urls = [
        'https://example.com',
        'https://google.com'
      ]
      const result = validateBulkUrls(urls)
      
      expect(result.isValid).to.be.true
      expect(result.validCount).to.equal(2)
    })

    it('should handle edge cases gracefully', () => {
      expect(() => validateBulkUrls('not-an-array')).to.not.throw()
      expect(() => validateBulkUrls(null)).to.not.throw()
      expect(() => validateBulkUrls(undefined)).to.not.throw()
    })

    it('should provide detailed error information for invalid URLs', () => {
      const urls = [
        'https://example.com',
        'invalid-url',
        'ftp://unsupported.com'
      ]
      const result = validateBulkUrls(urls)
      
      expect(result.isValid).to.be.false
      expect(result.failedUrls).to.have.length(2)
      expect(result.details).to.be.an('array')
    })

    it('should handle URLs with special characters and encoding', () => {
      const urls = [
        'https://example.com/path?query=value&another=test',
        'https://example.com/ünicode'
      ]
      const result = validateBulkUrls(urls)
      
      expect(result.isValid).to.be.true
    })

    it('should handle performance testing with large arrays', () => {
      const urls = new Array(100).fill('https://example.com')
      
      const startTime = Date.now()
      const result = validateBulkUrls(urls)
      const endTime = Date.now()

      expect(result.isValid).to.be.true
      expect(endTime - startTime).to.be.lessThan(1000) // Should complete within 1 second
    })

    it('should provide detailed error information for mixed URLs', () => {
      const urls = [
        'https://example.com',
        'invalid-url-1',
        'http://valid.com',
        'invalid-url-2'
      ]

      const result = validateBulkUrls(urls)
      expect(result.isValid).to.be.false
      expect(result.failedUrls).to.have.length(2)
      expect(result.validCount).to.equal(2)
      expect(result.totalCount).to.equal(4)
    })
  })

  describe('validateShortCode()', () => {
    it('should accept valid short codes', () => {
      const validCodes = ['abc12', 'XYZ99', 'aBc12']
      
      validCodes.forEach(code => {
        const result = validateShortCode(code)
        expect(result.isValid).to.be.true
        expect(result.error).to.be.undefined
      })
    })

    it('should reject invalid short codes', () => {
      const invalidCodes = [
        '',           // empty
        'a',          // too short 
        'abcdef',     // too long (default is 5 chars)
        'abc!@',      // invalid characters
        '12345'       // numbers only (depends on charset config)
      ]
      
      invalidCodes.forEach(code => {
        const result = validateShortCode(code)
        expect(result.isValid).to.be.false
        expect(result.error).to.be.a('string')
      })
    })

    it('should handle null and undefined input', () => {
      expect(validateShortCode(null).isValid).to.be.false
      expect(validateShortCode(undefined).isValid).to.be.false
      expect(validateShortCode().isValid).to.be.false
    })

    it('should handle non-string input', () => {
      expect(validateShortCode(123).isValid).to.be.false
      expect(validateShortCode({}).isValid).to.be.false
      expect(validateShortCode([]).isValid).to.be.false
    })

    it('should validate short code length', () => {
      const exactLength = 'abc12' // 5 characters (default expected length)
      const result = validateShortCode(exactLength)
      expect(result.isValid).to.be.true
    })
  })

  describe('validateRequestSize()', () => {
    it('should validate request body size limits', () => {
      const requestBody = {
        urls: new Array(50).fill('https://example.com')
      }
      
      const result = validateRequestSize(requestBody)
      expect(result.isValid).to.be.true
    })

    it('should reject request body exceeding URL count limit', () => {
      const requestBody = {
        urls: new Array(1001).fill('https://example.com')
      }
      
      const result = validateRequestSize(requestBody, { maxUrlCount: 1000 })
      expect(result.isValid).to.be.false
      expect(result.error).to.include('limited to 1000 URLs')
    })

    it('should handle non-object request body', () => {
      const result = validateRequestSize('not-an-object')
      expect(result.isValid).to.be.false
      expect(result.error).to.include('must be a valid object')
    })
  })

  describe('createValidationErrorResponse()', () => {
    it('should return null for valid results', () => {
      const validResult = { isValid: true }
      const result = createValidationErrorResponse(validResult)
      expect(result).to.be.null
    })

    it('should format error response for invalid results', () => {
      const invalidResult = {
        isValid: false,
        error: 'Test error',
        details: ['Detail 1', 'Detail 2']
      }
      
      const result = createValidationErrorResponse(invalidResult, 'test context')
      expect(result.error).to.equal('Test error')
      expect(result.details).to.be.an('array')
      expect(result.context).to.equal('test context')
    })
  })
}) 