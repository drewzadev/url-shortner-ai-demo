// Application configuration values
export const appConfig = {
  server: {
    port: process.env.PORT || 3000,
    trustProxy: process.env.TRUST_PROXY === 'true',
    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT_MS) || 30000,
    baseUrl: process.env.BASE_URL || 'http://localhost:3000'
  },
  shortCode: {
    poolSize: parseInt(process.env.SHORT_CODE_POOL_SIZE) || 1000000,
    minPoolSize: parseInt(process.env.SHORT_CODE_POOL_MIN_SIZE) || 10000,
    replenishThreshold: parseInt(process.env.SHORT_CODE_REPLENISH_THRESHOLD) || 5000,
    batchSize: parseInt(process.env.SHORT_CODE_GENERATION_BATCH_SIZE) || 50000,
    length: parseInt(process.env.SHORT_CODE_LENGTH) || 5,
    charset: process.env.SHORT_CODE_CHARSET || 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  },
  url: {
    maxLength: parseInt(process.env.URL_MAX_LENGTH) || 2048,
    minLength: parseInt(process.env.URL_MIN_LENGTH) || 10,
    defaultExpirationMonths: parseInt(process.env.URL_DEFAULT_EXPIRATION_MONTHS) || 6,
    cacheTtlSeconds: parseInt(process.env.URL_CACHE_TTL_SECONDS) || 3600,
    bulkOperationLimit: parseInt(process.env.URL_BULK_OPERATION_LIMIT) || 1000,
    allowedProtocols: (process.env.URL_ALLOWED_PROTOCOLS || 'http:,https:').split(','),
    allowLocalhost: process.env.URL_ALLOW_LOCALHOST === 'true',
    allowIpAddresses: process.env.URL_ALLOW_IP_ADDRESSES === 'true'
  },
  validation: {
    maxRequestBodySize: parseInt(process.env.MAX_REQUEST_BODY_SIZE_BYTES) || 10 * 1024 * 1024, // 10MB
    maxErrorDetailsCount: parseInt(process.env.MAX_ERROR_DETAILS_COUNT) || 5,
    strictValidation: process.env.STRICT_URL_VALIDATION === 'true'
  },
  database: {
    connectionPoolMax: parseInt(process.env.DB_CONNECTION_POOL_MAX) || 10,
    poolTimeout: parseInt(process.env.DB_POOL_TIMEOUT_MS) || 10000,
    connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT_MS) || 5000,
    socketTimeout: parseInt(process.env.DB_SOCKET_TIMEOUT_MS) || 30000,
    idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT_MS) || 300000
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD,
    database: parseInt(process.env.REDIS_DATABASE) || 0,
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'urlshortener:',
    connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT_MS) || 5000,
    commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT_MS) || 3000,
    retryAttempts: parseInt(process.env.REDIS_RETRY_ATTEMPTS) || 3,
    retryDelay: parseInt(process.env.REDIS_RETRY_DELAY_MS) || 1000
  },
  logging: {
    level: process.env.LOG_LEVEL?.toLowerCase() || (process.env.NODE_ENV === 'production' ? 'info' : 'debug')
  }
} 