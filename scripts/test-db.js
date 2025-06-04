import { PrismaClient } from '@prisma/client'
import moment from 'moment'
import __ from '../libs/attempt.mjs'
import logger from '../config/logger.js'

const prisma = new PrismaClient()
const logPrefix = 'DatabaseTester'

class DatabaseTester {
  constructor() {
    this.logger = logger
    this.testResults = {
      connection: false,
      create: false,
      read: false,
      update: false,
      delete: false,
      healthCheck: false
    }
  }

  async testConnection() {
    this.logger.info(logPrefix, 'Testing database connection...')
    
    const [error] = await __(prisma.$connect())
    if (error) {
      this.logger.error(logPrefix, 'Database connection failed:', error)
      return false
    }
    
    this.logger.info(logPrefix, 'Database connection successful')
    return true
  }

  async testCreate() {
    this.logger.info(logPrefix, 'Testing CREATE operation...')
    
    const testUrl = {
      originalUrl: 'https://www.test-create.com',
      shortCode: 'tst01',
      expiresAt: moment().add(1, 'month').toDate()
    }
    
    const [error, createdUrl] = await __(prisma.url.create({
      data: testUrl
    }))
    
    if (error) {
      this.logger.error(logPrefix, 'CREATE operation failed:', error)
      return false
    }
    
    this.logger.info(logPrefix, 'CREATE operation successful', { id: createdUrl.id, shortCode: createdUrl.shortCode })
    this.testData = createdUrl
    return true
  }

  async testRead() {
    this.logger.info(logPrefix, 'Testing READ operation...')
    
    if (!this.testData) {
      this.logger.error(logPrefix, 'No test data available for READ operation')
      return false
    }
    
    const [error, foundUrl] = await __(prisma.url.findUnique({
      where: { shortCode: this.testData.shortCode }
    }))
    
    if (error || !foundUrl) {
      this.logger.error(logPrefix, 'READ operation failed:', error)
      return false
    }
    
    this.logger.info(logPrefix, 'READ operation successful', { 
      id: foundUrl.id, 
      shortCode: foundUrl.shortCode,
      originalUrl: foundUrl.originalUrl
    })
    return true
  }

  async testUpdate() {
    this.logger.info(logPrefix, 'Testing UPDATE operation...')
    
    if (!this.testData) {
      this.logger.error(logPrefix, 'No test data available for UPDATE operation')
      return false
    }
    
    const [error, updatedUrl] = await __(prisma.url.update({
      where: { id: this.testData.id },
      data: { clickCount: { increment: 1 } }
    }))
    
    if (error) {
      this.logger.error(logPrefix, 'UPDATE operation failed:', error)
      return false
    }
    
    this.logger.info(logPrefix, 'UPDATE operation successful', { 
      id: updatedUrl.id,
      clickCount: updatedUrl.clickCount
    })
    return true
  }

  async testDelete() {
    this.logger.info(logPrefix, 'Testing DELETE operation...')
    
    if (!this.testData) {
      this.logger.error(logPrefix, 'No test data available for DELETE operation')
      return false
    }
    
    const [error] = await __(prisma.url.delete({
      where: { id: this.testData.id }
    }))
    
    if (error) {
      this.logger.error(logPrefix, 'DELETE operation failed:', error)
      return false
    }
    
    this.logger.info(logPrefix, 'DELETE operation successful')
    return true
  }

  async testHealthCheck() {
    this.logger.info(logPrefix, 'Testing health check...')
    
    const [error] = await __(prisma.$queryRaw`SELECT 1 as health_check`)
    
    if (error) {
      this.logger.error(logPrefix, 'Health check failed:', error)
      return false
    }
    
    this.logger.info(logPrefix, 'Health check successful')
    return true
  }

  async testBulkOperations() {
    this.logger.info(logPrefix, 'Testing bulk operations...')
    
    const bulkUrls = [
      {
        originalUrl: 'https://www.bulk-test-1.com',
        shortCode: 'blk01',
        expiresAt: moment().add(1, 'month').toDate()
      },
      {
        originalUrl: 'https://www.bulk-test-2.com',
        shortCode: 'blk02',
        expiresAt: moment().add(1, 'month').toDate()
      },
      {
        originalUrl: 'https://www.bulk-test-3.com',
        shortCode: 'blk03',
        expiresAt: moment().add(1, 'month').toDate()
      }
    ]
    
    const [createError] = await __(prisma.url.createMany({
      data: bulkUrls,
      skipDuplicates: true
    }))
    
    if (createError) {
      this.logger.error(logPrefix, 'Bulk CREATE failed:', createError)
      return false
    }
    
    const [deleteError] = await __(prisma.url.deleteMany({
      where: {
        shortCode: {
          in: bulkUrls.map(url => url.shortCode)
        }
      }
    }))
    
    if (deleteError) {
      this.logger.error(logPrefix, 'Bulk DELETE failed:', deleteError)
      return false
    }
    
    this.logger.info(logPrefix, 'Bulk operations successful')
    return true
  }

  async runAllTests() {
    this.logger.info(logPrefix, 'Starting comprehensive database tests...')
    
    try {
      this.testResults.connection = await this.testConnection()
      this.testResults.healthCheck = await this.testHealthCheck()
      this.testResults.create = await this.testCreate()
      this.testResults.read = await this.testRead()
      this.testResults.update = await this.testUpdate()
      this.testResults.delete = await this.testDelete()
      this.testResults.bulk = await this.testBulkOperations()
      
      this.printResults()
      
    } catch (error) {
      this.logger.error(logPrefix, 'Test execution failed:', error)
      throw error
    } finally {
      await this.cleanup()
    }
  }

  printResults() {
    const passedTests = Object.values(this.testResults).filter(result => result === true).length
    const totalTests = Object.keys(this.testResults).length
    
    this.logger.info(logPrefix, 'Test Results Summary:', {
      passed: passedTests,
      total: totalTests,
      success: passedTests === totalTests,
      details: this.testResults
    })
    
    if (passedTests === totalTests) {
      this.logger.info(logPrefix, '🎉 All database tests passed!')
    } else {
      this.logger.error(logPrefix, '❌ Some database tests failed!')
    }
  }

  async cleanup() {
    this.logger.info(logPrefix, 'Cleaning up test data...')
    
    const [error] = await __(prisma.$disconnect())
    if (error) {
      this.logger.error(logPrefix, 'Error disconnecting from database:', error)
    } else {
      this.logger.info(logPrefix, 'Database cleanup completed')
    }
  }
}

async function main() {
  const tester = new DatabaseTester()
  
  const [error] = await __(tester.runAllTests())
  if (error) {
    logger.error(logPrefix, 'Database testing failed:', error)
    process.exit(1)
  }
  
  logger.info(logPrefix, 'Database testing completed successfully!')
}

process.on('SIGINT', async () => {
  logger.info(logPrefix, 'Received SIGINT, cleaning up...')
  await prisma.$disconnect()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  logger.info(logPrefix, 'Received SIGTERM, cleaning up...')
  await prisma.$disconnect()
  process.exit(0)
})

main()