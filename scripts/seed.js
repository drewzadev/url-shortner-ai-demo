import moment from 'moment'
import __ from '../libs/attempt.mjs'
import { createCoreServices, shutdownCoreServices } from '../libs/bootstrap.js'

const logPrefix = 'DatabaseSeeder'

const sampleUrls = [
  {
    originalUrl: 'https://www.google.com',
    shortCode: 'ggl01',
    clickCount: 25
  },
  {
    originalUrl: 'https://www.github.com',
    shortCode: 'ghb02',
    clickCount: 12
  },
  {
    originalUrl: 'https://www.stackoverflow.com',
    shortCode: 'sof03',
    clickCount: 8
  },
  {
    originalUrl: 'https://www.nodejs.org',
    shortCode: 'njs04',
    clickCount: 15
  },
  {
    originalUrl: 'https://www.prisma.io',
    shortCode: 'prm05',
    clickCount: 3
  },
  {
    originalUrl: 'https://www.express.js.com',
    shortCode: 'exp06',
    clickCount: 7
  },
  {
    originalUrl: 'https://www.redis.io',
    shortCode: 'rds07',
    clickCount: 4
  },
  {
    originalUrl: 'https://www.postgresql.org',
    shortCode: 'psg08',
    clickCount: 6
  },
  {
    originalUrl: 'https://www.docker.com',
    shortCode: 'doc09',
    clickCount: 18
  },
  {
    originalUrl: 'https://www.tailwindcss.com',
    shortCode: 'twc10',
    clickCount: 9
  }
]

async function generateExpirationDate(monthsFromNow = 6) {
  return moment().add(monthsFromNow, 'months').toDate()
}

async function clearExistingData(prisma, logger) {
  logger.info(logPrefix, 'Clearing existing seed data...')
  
  const [deleteError] = await __(prisma.url.deleteMany({
    where: {
      shortCode: {
        in: sampleUrls.map(url => url.shortCode)
      }
    }
  }))
  
  if (deleteError) {
    logger.error(logPrefix, 'Error clearing existing data:', deleteError)
    throw deleteError
  }
  
  logger.info(logPrefix, 'Existing seed data cleared')
}

async function seedUrls(prisma, logger) {
  logger.info(logPrefix, 'Seeding URLs...')
  
  for (const urlData of sampleUrls) {
    const expiresAt = await generateExpirationDate(
      Math.floor(Math.random() * 12) + 1 // Random 1-12 months
    )
    
    const [createError, createdUrl] = await __(prisma.url.create({
      data: {
        originalUrl: urlData.originalUrl,
        shortCode: urlData.shortCode,
        expiresAt,
        clickCount: urlData.clickCount
      }
    }))
    
    if (createError) {
      logger.error(logPrefix, `Error creating URL for ${urlData.shortCode}:`, createError)
      throw createError
    }
    
    logger.debug(logPrefix, `Created URL: ${urlData.shortCode} -> ${urlData.originalUrl}`)
  }
  
  logger.info(logPrefix, `Successfully seeded ${sampleUrls.length} URLs`)
}

async function createExpiredUrl(prisma, logger) {
  logger.info(logPrefix, 'Creating expired URL for testing...')
  
  const expiredUrl = {
    originalUrl: 'https://www.example.com/expired',
    shortCode: 'exp99',
    expiresAt: moment().subtract(1, 'day').toDate(),
    clickCount: 0
  }
  
  const [createError] = await __(prisma.url.create({
    data: expiredUrl
  }))
  
  if (createError) {
    logger.error(logPrefix, 'Error creating expired URL:', createError)
    throw createError
  }
  
  logger.info(logPrefix, 'Created expired URL for testing')
}

async function printSeedSummary(prisma, logger) {
  const [countError, totalUrls] = await __(prisma.url.count())
  
  if (countError) {
    logger.error(logPrefix, 'Error getting URL count:', countError)
    return
  }
  
  const [expiredError, expiredUrls] = await __(prisma.url.count({
    where: {
      expiresAt: {
        lt: new Date()
      }
    }
  }))
  
  if (expiredError) {
    logger.error(logPrefix, 'Error getting expired URL count:', expiredError)
    return
  }
  
  logger.info(logPrefix, 'Seed Summary:', {
    totalUrls,
    expiredUrls,
    activeUrls: totalUrls - expiredUrls
  })
}

async function main() {
  let services
  
  try {
    // Initialize core services
    services = await createCoreServices()
    const { logger, database, redis } = services
    
    logger.info(logPrefix, 'Starting database seeding...')
    
    // Use database service instead of direct Prisma client
    const prisma = database.getClient()
    
    // Clear existing seed data
    await clearExistingData(prisma, logger)
    
    // Seed new data
    await seedUrls(prisma, logger)
    await createExpiredUrl(prisma, logger)
    
    // Print summary
    await printSeedSummary(prisma, logger)
    
    logger.info(logPrefix, 'Database seeding completed successfully!')
    
  } catch (error) {
    if (services && services.logger) {
      services.logger.error(logPrefix, 'Database seeding failed:', error)
    } else {
      console.error('Database seeding failed:', error)
    }
    process.exit(1)
  } finally {
    if (services) {
      await shutdownCoreServices(services)
    }
  }
}

// Run the seeder
const [seedError] = await __(main())
if (seedError) {
  console.error('Seeding failed:', seedError)
  process.exit(1)
}