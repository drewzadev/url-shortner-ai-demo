## Relevant Files

- `services/UrlService.js` - Core business logic service for URL operations (new file to be created)
- `services/UrlService.test.js` - Unit tests for UrlService
- `utils/validators.js` - URL validation utilities (new file to be created)  
- `utils/validators.test.js` - Unit tests for validators
- `routes/api.js` - API route handlers (existing file to be modified)
- `routes/api.test.js` - Integration tests for API routes
- `config/app.js` - Application configuration (existing file to be modified)
- `test/integration/api.test.js` - Integration tests for API endpoints
- `test/services/UrlService.test.js` - Unit tests for UrlService

### Notes

- Unit tests should be placed in the `test/` directory with corresponding folder structure
- Use `npm test` to run all tests via Mocha
- Use `npm run lint` to run StandardJS linting
- Environment variables should be configured in `.env` file
- Integration tests should verify end-to-end API functionality

## Tasks

- [ ] 1.0 Create UrlService Business Logic Layer
  - [ ] 1.1 Create UrlService class with constructor accepting database, redis, and logger dependencies
  - [ ] 1.2 Implement createShortUrl(originalUrl) method with URL validation, short code retrieval, database creation, and caching
  - [ ] 1.3 Implement createBulkShortUrls(urls) method with batch processing, transaction handling, and all-or-nothing failure semantics
  - [ ] 1.4 Implement getUrlByShortCode(shortCode) method with cache-first lookup and database fallback
  - [ ] 1.5 Implement deleteUrl(shortCode) method with database deletion and cache invalidation
  - [ ] 1.6 Implement getAllUrls() method to retrieve all URLs from database with metadata
  - [ ] 1.7 Implement incrementClickCount(shortCode) method for tracking URL clicks
  - [ ] 1.8 Add comprehensive error handling using attempt.js wrapper throughout all methods
  - [ ] 1.9 Add detailed logging for all operations with appropriate log levels
  - [ ] 1.10 Implement expiration date calculation using Moment.js (default 6 months)

- [ ] 2.0 Implement Core API Endpoints  
  - [ ] 2.1 Modify POST /api/shorten endpoint to integrate with UrlService.createShortUrl()
  - [ ] 2.2 Modify POST /api/shorten/bulk endpoint to integrate with UrlService.createBulkShortUrls() and enforce 1000 URL limit
  - [ ] 2.3 Modify GET /api/url/:shortCode endpoint to integrate with UrlService.getUrlByShortCode()
  - [ ] 2.4 Modify DELETE /api/url/:shortCode endpoint to integrate with UrlService.deleteUrl()
  - [ ] 2.5 Modify GET /api/urls endpoint to integrate with UrlService.getAllUrls()
  - [ ] 2.6 Implement standardized JSON response format for all success responses
  - [ ] 2.7 Implement standardized error response format with status_code, error.code, error.message, and error.details structure
  - [ ] 2.8 Add proper HTTP status code mapping (200, 201, 400, 404, 500)
  - [ ] 2.9 Add request validation and parsing for all endpoints
  - [ ] 2.10 Update route factory to instantiate UrlService with proper dependencies

- [ ] 3.0 Add URL Validation and Configuration
  - [ ] 3.1 Create utils/validators.js with basic URL validation function (protocol check, format validation)
  - [ ] 3.2 Add URL length validation (configurable max length, default 2048 characters)
  - [ ] 3.3 Implement validation for bulk URL requests (array format, individual URL validation)
  - [ ] 3.4 Add configuration values to config/app.js for URL validation limits and default expiration
  - [ ] 3.5 Add configuration for base URL construction in API responses
  - [ ] 3.6 Add validation for request size limits (1000 URL maximum for bulk operations)
  - [ ] 3.7 Implement proper error messages for validation failures with details array

- [ ] 4.0 Integration and Error Handling
  - [ ] 4.1 Test integration between UrlService and existing DatabaseService
  - [ ] 4.2 Test integration between UrlService and existing RedisService for short code pool operations
  - [ ] 4.3 Test integration between UrlService and existing RedisService for URL caching operations
  - [ ] 4.4 Implement graceful handling of Redis connection failures (fallback to database-only operation)
  - [ ] 4.5 Implement graceful handling of database connection failures with appropriate error responses
  - [ ] 4.6 Test short code pool depletion scenarios and fallback short code generation
  - [ ] 4.7 Implement proper error logging with request context in route handlers
  - [ ] 4.8 Test unique constraint violation handling for short codes (retry with new code)
  - [ ] 4.9 Verify proper dependency injection throughout the application stack

- [ ] 5.0 Testing and Documentation
  - [ ] 5.1 Create unit tests for UrlService.createShortUrl() with various scenarios (success, validation failure, database error)
  - [ ] 5.2 Create unit tests for UrlService.createBulkShortUrls() including failure scenarios and transaction rollback
  - [ ] 5.3 Create unit tests for UrlService.getUrlByShortCode() with cache hit, cache miss, and not found scenarios
  - [ ] 5.4 Create unit tests for UrlService.deleteUrl() and UrlService.getAllUrls()
  - [ ] 5.5 Create unit tests for URL validation utilities with various valid and invalid URLs
  - [ ] 5.6 Create integration tests for all API endpoints with success and error scenarios
  - [ ] 5.7 Create integration tests for bulk operations with various payload sizes
  - [ ] 5.8 Test API endpoints with Redis and database failure scenarios
  - [ ] 5.9 Verify standardized error response format across all endpoints and error conditions
  - [ ] 5.10 Test complete end-to-end URL creation, retrieval, and deletion workflows 