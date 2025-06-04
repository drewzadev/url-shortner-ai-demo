import __ from '../libs/attempt.mjs'
import logger from '../config/logger.js'

class ShortCodeService {
  constructor() {
    this.logPrefix = 'ShortCodeService'
    this.logger = logger
    
    // Load configuration from environment
    this.charset = process.env.SHORT_CODE_CHARSET || 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    this.length = parseInt(process.env.SHORT_CODE_LENGTH) || 5
    this.poolSize = parseInt(process.env.SHORT_CODE_POOL_SIZE) || 1000000
    this.batchSize = parseInt(process.env.SHORT_CODE_GENERATION_BATCH_SIZE) || 50000
    
    this.logger.info(this.logPrefix, 'Initialized with configuration', {
      charsetLength: this.charset.length,
      codeLength: this.length,
      poolSize: this.poolSize,
      batchSize: this.batchSize
    })
  }

  /**
   * Generate a single random short code
   * @returns {string} A random short code
   */
  generateShortCode() {
    let result = ''
    
    for (let i = 0; i < this.length; i++) {
      const randomIndex = Math.floor(Math.random() * this.charset.length)
      result += this.charset[randomIndex]
    }
    
    return result
  }

  /**
   * Generate multiple unique short codes
   * @param {number} count - Number of codes to generate
   * @param {Set} excludeSet - Set of codes to exclude (optional)
   * @returns {Array<string>} Array of unique short codes
   */
  generateShortCodes(count, excludeSet = new Set()) {
    const codes = new Set()
    const maxAttempts = count * 10 // Prevent infinite loops
    let attempts = 0
    
    this.logger.debug(this.logPrefix, `Generating ${count} short codes`, {
      excludeCount: excludeSet.size
    })
    
    while (codes.size < count && attempts < maxAttempts) {
      const code = this.generateShortCode()
      
      if (!excludeSet.has(code) && !codes.has(code)) {
        codes.add(code)
      }
      
      attempts++
    }
    
    if (codes.size < count) {
      this.logger.warn(this.logPrefix, 'Could not generate requested number of unique codes', {
        requested: count,
        generated: codes.size,
        attempts: attempts
      })
    }
    
    return Array.from(codes)
  }

  /**
   * Generate short codes in batches
   * @param {number} totalCount - Total number of codes to generate
   * @param {Set} excludeSet - Set of codes to exclude
   * @param {Function} progressCallback - Progress callback function
   * @returns {Array<string>} Array of unique short codes
   */
  async generateShortCodesBatch(totalCount, excludeSet = new Set(), progressCallback = null) {
    const allCodes = new Set()
    const batches = Math.ceil(totalCount / this.batchSize)
    
    this.logger.info(this.logPrefix, `Starting batch generation`, {
      totalCount,
      batchSize: this.batchSize,
      batches,
      excludeCount: excludeSet.size
    })
    
    for (let batch = 0; batch < batches; batch++) {
      const remainingCount = totalCount - allCodes.size
      const currentBatchSize = Math.min(this.batchSize, remainingCount)
      
      if (currentBatchSize <= 0) break
      
      const batchCodes = this.generateShortCodes(currentBatchSize, new Set([...excludeSet, ...allCodes]))
      
      for (const code of batchCodes) {
        allCodes.add(code)
      }
      
      this.logger.debug(this.logPrefix, `Completed batch ${batch + 1}/${batches}`, {
        batchGenerated: batchCodes.length,
        totalGenerated: allCodes.size,
        remaining: totalCount - allCodes.size
      })
      
      if (progressCallback) {
        progressCallback({
          batch: batch + 1,
          totalBatches: batches,
          generated: allCodes.size,
          total: totalCount,
          percentage: Math.round((allCodes.size / totalCount) * 100)
        })
      }
      
      // Allow event loop to process other tasks
      await new Promise(resolve => setImmediate(resolve))
    }
    
    this.logger.info(this.logPrefix, `Batch generation completed`, {
      requested: totalCount,
      generated: allCodes.size,
      batches
    })
    
    return Array.from(allCodes)
  }

  /**
   * Validate if a string is a valid short code
   * @param {string} code - Code to validate
   * @returns {boolean} True if valid
   */
  isValidShortCode(code) {
    if (!code || typeof code !== 'string') {
      return false
    }
    
    if (code.length !== this.length) {
      return false
    }
    
    for (const char of code) {
      if (!this.charset.includes(char)) {
        return false
      }
    }
    
    return true
  }

  /**
   * Filter valid short codes from an array
   * @param {Array<string>} codes - Array of codes to filter
   * @returns {Array<string>} Array of valid codes
   */
  filterValidCodes(codes) {
    return codes.filter(code => this.isValidShortCode(code))
  }

  /**
   * Calculate the theoretical maximum number of unique codes
   * @returns {number} Maximum possible unique codes
   */
  getMaxPossibleCodes() {
    return Math.pow(this.charset.length, this.length)
  }

  /**
   * Calculate collision probability for a given number of codes
   * @param {number} generatedCount - Number of codes generated
   * @returns {number} Collision probability (0-1)
   */
  calculateCollisionProbability(generatedCount) {
    const maxCodes = this.getMaxPossibleCodes()
    
    if (generatedCount >= maxCodes) {
      return 1
    }
    
    // Approximate collision probability using birthday paradox
    const probability = 1 - Math.exp(-0.5 * generatedCount * (generatedCount - 1) / maxCodes)
    return Math.min(probability, 1)
  }

  /**
   * Get configuration information
   * @returns {Object} Configuration details
   */
  getConfiguration() {
    return {
      charset: this.charset,
      charsetLength: this.charset.length,
      codeLength: this.length,
      poolSize: this.poolSize,
      batchSize: this.batchSize,
      maxPossibleCodes: this.getMaxPossibleCodes(),
      charactersUsed: {
        lowercase: /[a-z]/.test(this.charset),
        uppercase: /[A-Z]/.test(this.charset),
        numbers: /[0-9]/.test(this.charset)
      }
    }
  }

  /**
   * Generate statistics about the code space
   * @param {number} currentPoolSize - Current pool size
   * @returns {Object} Statistics
   */
  getCodeSpaceStatistics(currentPoolSize = 0) {
    const maxCodes = this.getMaxPossibleCodes()
    const collisionProbability = this.calculateCollisionProbability(currentPoolSize)
    
    return {
      maxPossibleCodes: maxCodes,
      currentPoolSize,
      utilizationPercentage: (currentPoolSize / maxCodes) * 100,
      remainingCodes: maxCodes - currentPoolSize,
      collisionProbability,
      recommendedPoolSize: Math.min(Math.sqrt(maxCodes), this.poolSize)
    }
  }
}

export default ShortCodeService