# Product Requirements Document: Core API Implementation

## Introduction/Overview

This document outlines the requirements for implementing the Core API endpoints of the URL Shortener service. The API provides programmatic access to URL shortening functionality through RESTful JSON endpoints. This builds upon the existing infrastructure that has already been established, including database services, Redis integration, and short code pool management.

## Goals

1. Implement functional API endpoints that replace the current 501 "Not Implemented" responses
2. Provide reliable single and bulk URL shortening capabilities
3. Enable programmatic management of shortened URLs (retrieval, deletion, listing)
4. Establish consistent error handling and response formats across all endpoints
5. Create a new UrlService that integrates with existing database infrastructure
6. Ensure proper logging and error tracking for all API operations

## User Stories

1. **As a developer, I want to create a single shortened URL via API** so that I can integrate URL shortening into my applications.

2. **As a developer, I want to create multiple shortened URLs in one API call** so that I can efficiently process batches of URLs without making individual requests.

3. **As a developer, I want to retrieve details about a shortened URL** so that I can display URL information and statistics in my application.

4. **As a developer, I want to delete a shortened URL via API** so that I can programmatically manage and clean up URLs.

5. **As a developer, I want to list all shortened URLs** so that I can display URL management interfaces in my applications.

6. **As a developer, I want consistent error responses** so that I can reliably handle API errors in my applications.

## Functional Requirements

### API Endpoint Implementation

1. **POST /api/shorten** - The system must accept a JSON request with an `url` field and return a shortened URL with appropriate metadata.

2. **POST /api/shorten/bulk** - The system must accept a JSON request with a `urls` array (up to 1000 URLs) and return an array of shortened URL mappings.

3. **GET /api/url/:shortCode** - The system must return detailed information about a shortened URL including original URL, creation date, expiration date, and click count.

4. **DELETE /api/url/:shortCode** - The system must delete a shortened URL from the database and return appropriate confirmation.

5. **GET /api/urls** - The system must return a list of all shortened URLs with their metadata.

### UrlService Requirements

6. **UrlService Creation** - The system must include a new UrlService class that handles all URL-related business logic operations.

7. **URL Validation** - The UrlService must validate URL format for basic correctness before processing (protocol check, basic format validation).

8. **Short Code Integration** - The UrlService must integrate with the existing RedisService to obtain short codes from the pre-generated pool.

9. **Database Operations** - The UrlService must handle all Prisma database operations for URL creation, retrieval, updating, and deletion.

10. **Caching Integration** - The UrlService must use RedisService for caching frequently accessed URLs to improve performance.

11. **Expiration Handling** - The UrlService must calculate and set appropriate expiration dates for new URLs (configurable default: 6 months).

12. **Click Tracking** - The UrlService must provide methods to increment click counts when URLs are accessed.

### Request/Response Format Standards

13. All API responses must use JSON format with consistent structure.

14. Success responses must include appropriate HTTP status codes (200, 201) and structured data.

15. Error responses must follow the standardized format:
   ```json
   {
     "status_code": 400,
     "error": {
       "code": "BadRequest",
       "message": "Descriptive error message",
       "details": []
     }
   }
   ```

16. The bulk URL creation endpoint must use the request format: `{ "urls": ["http://example1.com", "http://example2.com"] }`

### Validation & Error Handling

17. The system must validate URL format for basic correctness before processing.

18. The system must handle cases where short codes are not found with appropriate 404 responses.

19. The system must enforce the 1000 URL limit for bulk operations with proper error responses.

20. For bulk operations, if any URL fails validation or processing, the entire operation must fail (no partial success).

21. All database errors must be caught and returned as standardized error responses.

### Integration Requirements

22. All endpoints must integrate with the new UrlService for business logic operations.

23. The system must use the existing attempt.js wrapper for error handling in async operations.

24. All API operations must be logged using the existing Winston logger with appropriate log levels.

25. The system must use existing DatabaseService and RedisService through dependency injection.

### Performance & Data Requirements

26. Single URL creation should respond within standard HTTP timeout limits.

27. Bulk URL creation should handle up to 1000 URLs without timing out.

28. URL retrieval operations should utilize Redis caching where available.

29. The UrlService must handle database connection failures gracefully and provide fallback behavior where appropriate.

## Non-Goals (Out of Scope)

1. **API Versioning**: No version prefixes or backwards compatibility concerns for this initial implementation.
2. **Authentication/Authorization**: No API keys, rate limiting, or access control mechanisms.
3. **Advanced Caching Headers**: No Cache-Control, ETag, or other HTTP caching mechanisms.
4. **Partial Success for Bulk Operations**: Bulk operations must be all-or-nothing transactions.
5. **Custom Error Codes**: Using standard HTTP status codes only, no custom application error codes.
6. **Request Size Validation**: Beyond the 1000 URL limit, no additional request size restrictions.
7. **Response Pagination**: Initial implementation returns all URLs without pagination.
8. **ApiController Layer**: Routes will handle HTTP concerns directly to maintain simplicity.

## Design Considerations

### UrlService Architecture

The UrlService should be designed as the central business logic layer for all URL operations:

**Core Methods:**
- `createShortUrl(originalUrl)` - Create single shortened URL
- `createBulkShortUrls(urls)` - Create multiple shortened URLs
- `getUrlByShortCode(shortCode)` - Retrieve URL details
- `deleteUrl(shortCode)` - Delete a URL
- `getAllUrls()` - List all URLs
- `incrementClickCount(shortCode)` - Track URL clicks
- `validateUrl(url)` - Basic URL validation

**Integration Dependencies:**
- DatabaseService (via constructor injection) for Prisma operations
- RedisService (via constructor injection) for short code pool and caching
- Logger (via constructor injection) for operational logging

**Error Handling Strategy:**
- Use attempt.js wrapper for all async operations
- Return structured error objects that routes can map to HTTP responses
- Provide detailed logging for all operations and errors

### API Response Structures

**Single URL Creation Response:**
```json
{
  "success": true,
  "data": {
    "original_url": "https://example.com/very/long/url",
    "short_url": "https://short.ly/abc123",
    "short_code": "abc123",
    "created_at": "2024-01-15T10:30:00Z",
    "expires_at": "2024-07-15T10:30:00Z"
  }
}
```

**Bulk URL Creation Response:**
```json
{
  "success": true,
  "data": [
    {
      "original_url": "https://example1.com",
      "short_url": "https://short.ly/abc123",
      "short_code": "abc123"
    },
    {
      "original_url": "https://example2.com", 
      "short_url": "https://short.ly/def456",
      "short_code": "def456"
    }
  ]
}
```

**URL Details Response:**
```json
{
  "success": true,
  "data": {
    "original_url": "https://example.com",
    "short_code": "abc123",
    "created_at": "2024-01-15T10:30:00Z",
    "expires_at": "2024-07-15T10:30:00Z",
    "click_count": 42
  }
}
```

### HTTP Status Code Standards

- **200 OK**: Successful GET, DELETE operations
- **201 Created**: Successful POST operations (URL creation)
- **400 Bad Request**: Invalid request format, URL validation failures
- **404 Not Found**: Short code not found
- **500 Internal Server Error**: Database errors, Redis errors, unexpected failures

### Route Handler Architecture

Instead of a separate ApiController layer, routes will handle HTTP concerns directly:

**Route Responsibilities:**
- Request validation and parsing
- Calling appropriate UrlService methods
- Formatting responses according to API standards
- Mapping service errors to appropriate HTTP status codes
- Request/response logging

**Benefits of Direct Route Approach:**
- Simpler architecture with fewer layers
- Direct control over HTTP formatting in routes
- Less abstraction overhead
- Clearer error handling flow
- Easier testing of individual endpoints

## Technical Considerations

### UrlService Implementation Details

**URL Validation:**
- Basic protocol validation (http/https)
- Basic format checking using URL constructor or regex
- Length limits (configurable, default max 2048 characters)
- No advanced validation (SSL checks, reachability, etc.)

**Short Code Integration:**
- Use RedisService.getShortCode() to obtain codes from pool
- Handle fallback when pool is empty (via RedisService fallback generation)
- Log pool status and alerts when pool is low

**Database Operations:**
- Use Prisma client through DatabaseService
- Handle unique constraint violations for short codes
- Implement proper error mapping for database failures
- Use transactions for bulk operations to ensure atomicity

**Caching Strategy:**
- Cache URL mappings in Redis with configurable TTL (default 1 hour)
- Cache-aside pattern: check cache first, then database
- Invalidate cache on URL deletion
- Handle Redis failures gracefully (continue with database-only operation)

**Expiration Calculation:**
- Default expiration: 6 months from creation date using Moment.js
- Configurable via environment variables
- Handle timezone considerations (store as UTC)

### Dependencies Required

- DatabaseService (existing) for Prisma operations
- RedisService (existing) for short code pool and caching
- Winston logger (existing) for operational logging
- attempt.js wrapper (existing) for async error handling
- Express.js router (already configured)
- Moment.js (existing) for date calculations

### Integration Points

**Existing Services:**
- `RedisService.getShortCode()` - Obtain short codes from pool
- `RedisService.cacheUrl()` - Cache URL mappings
- `RedisService.getCachedUrl()` - Retrieve cached URLs
- `RedisService.removeCachedUrl()` - Invalidate cache entries
- `DatabaseService.getClient()` - Access Prisma client
- `DatabaseService.healthCheck()` - Verify database connectivity

**Database Schema (Prisma Model):**
```prisma
model Url {
  id           String   @id @default(cuid())
  originalUrl  String   @map("original_url")
  shortCode    String   @unique @map("short_code")
  createdAt    DateTime @default(now()) @map("created_at")
  expiresAt    DateTime @map("expires_at")
  clickCount   Int      @default(0) @map("click_count")
}
```

### Error Handling Strategy

**Service Level:**
- Use try/catch blocks with attempt.js wrapper in all async operations
- Return structured error objects with type, message, and details
- Log all errors with appropriate context before throwing/returning
- Handle specific error types (validation, database, Redis, etc.)

**Route Level:**
- Map service error types to HTTP status codes
- Format error responses according to standardized JSON structure
- Log HTTP errors with request context
- Ensure no sensitive information is exposed in error messages

## Success Metrics

1. **Functionality**: All 5 API endpoints return proper responses instead of 501 errors
2. **Reliability**: 100% of valid API requests receive appropriate responses
3. **Error Handling**: All error conditions return standardized error format
4. **Integration**: All endpoints successfully integrate with new UrlService
5. **Performance**: API responses within acceptable timeframes for single and bulk operations
6. **Logging**: All API operations properly logged for debugging and monitoring
7. **Service Creation**: UrlService successfully created and integrated with existing infrastructure

## Open Questions

1. **URL Listing Pagination**: Should the GET /api/urls endpoint support query parameters for pagination in future iterations?
2. **Bulk Response Order**: Should the bulk URL response maintain the same order as the input URLs array?
3. **Soft Delete vs Hard Delete**: Should URL deletion be a soft delete (mark as deleted) or hard delete (remove from database)?
4. **Click Tracking via API**: Should API endpoints that retrieve URL details also increment click counters, or should this only happen during redirects?
5. **Base URL Configuration**: How should the API determine the base URL for constructing complete short URLs in responses? (Use appConfig.server.baseUrl)
6. **URL Validation Strictness**: What level of URL validation is appropriate? (Basic format only, or include checks for valid domains, protocols, etc.)
7. **Default Expiration Configuration**: Should the default 6-month expiration be configurable via environment variables?
8. **Bulk Operation Limits**: Should there be configurable limits for bulk operations beyond the 1000 URL limit?

## Implementation Tasks Summary

**New Components to Create:**
1. `services/UrlService.js` - Core business logic service
2. `utils/validators.js` - URL validation utilities (if needed)

**Existing Components to Modify:**
1. `routes/api.js` - Replace 501 responses with actual implementations
2. `config/app.js` - Add URL-related configuration values (expiration defaults, validation limits)

**Integration Points:**
- UrlService will use existing DatabaseService, RedisService, and Logger
- Routes will use UrlService methods and handle HTTP formatting directly
- No separate ApiController layer needed for this implementation 