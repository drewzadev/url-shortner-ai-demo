# Product Requirements Document: URL Shortener Service

## Introduction/Overview

This document outlines the requirements for a personal URL Shortener service built with Node.js and Express.js. The service will allow the creation of shortened URLs from long URLs, track click analytics, and provide both API endpoints and a web interface for management. The system is designed for personal use with the ability to handle individual and bulk URL shortening operations.

## Goals

1. Create a fast and reliable URL shortening service for personal use
2. Provide both individual and bulk URL shortening capabilities
3. Track click analytics for shortened URLs
4. Implement automatic URL expiration and cleanup
5. Offer a simple web interface for URL management
6. Build a scalable REST API for programmatic access
7. Ensure high performance through Redis caching and PostgreSQL storage

## User Stories

1. **As a user, I want to create a single shortened URL** so that I can easily share long URLs in a more compact format.

2. **As a user, I want to create multiple shortened URLs at once** so that I can efficiently process large batches of URLs without making individual requests.

3. **As a user, I want to see click statistics for my URLs** so that I can understand how often my links are being accessed.

4. **As a user, I want to view all my shortened URLs in a web interface** so that I can easily manage and review my links.

5. **As a user, I want to delete unwanted URLs** so that I can keep my URL list clean and organized.

6. **As a user, I want URLs to automatically expire after a certain time** so that I don't need to manually clean up old links.

7. **As a developer, I want to use REST APIs** so that I can integrate URL shortening into other applications or scripts.

## Functional Requirements

### Core URL Shortening
1. The system must generate shortened URLs using a pre-generated list of short codes stored in Redis.
2. The system must store URL mappings in a PostgreSQL database with the following information: original URL, short code, creation date, expiration date, and click count.
3. The system must redirect users from short URLs to their corresponding long URLs.
4. The system must increment a click counter each time a short URL is accessed.

### API Requirements
5. The system must provide a REST API endpoint for creating a single shortened URL that accepts a long URL and returns the shortened URL.
6. The system must provide a REST API endpoint for bulk URL creation that accepts an array of long URLs and returns a list of mappings between original and shortened URLs.
7. The bulk API must be able to process up to 1000 URLs in a single request.
8. All API responses must follow standard HTTP status codes and include appropriate JSON responses.

### Web Interface
9. The system must provide a web interface built with EJS templates and styled with Tailwind CSS.
10. The web interface must display a list of all shortened URLs with their details (original URL, short URL, creation date, click count).
11. The web interface must allow users to create a single shortened URL through a form.
12. The web interface must allow users to delete existing URLs.

### URL Management
13. The system must support URL expiration based on creation date.
14. The system must include a background process that automatically removes expired URLs from the database.
15. The system must handle cases where a short code is no longer available or a URL has expired.

### Performance & Caching
16. The system must use Redis for caching frequently accessed URL mappings to improve response times.
17. The system must pre-populate Redis with available short codes for URL generation.

### Logging & Monitoring
18. The system must log all significant events using Winston.js with appropriate log levels.
19. The system must log API requests, URL creations, clicks, and errors.

## Non-Goals (Out of Scope)

1. **User Authentication/Authorization**: No user accounts, login systems, or access control mechanisms.
2. **Custom Short Codes**: Users cannot specify custom short codes; all codes come from the pre-generated list.
3. **Advanced Analytics**: No detailed analytics beyond basic click counting (no geographic data, browser stats, etc.).
4. **Social Media Integration**: No direct integration with social media platforms.
5. **Email Notifications**: No email alerts for expired URLs or click milestones.
6. **Rate Limiting**: No sophisticated rate limiting beyond basic server capacity.
7. **URL Validation**: Minimal URL validation - basic format checking only.
8. **Mobile-Specific UI**: Responsive design but no dedicated mobile app.

## Design Considerations

### Web Interface
- **Styling**: Use Tailwind CSS for clean, modern styling
- **Templates**: EJS templates for server-side rendering
- **Layout**: Simple, table-based layout for URL listing
- **Forms**: Basic form styling with validation feedback
- **Responsive**: Ensure usability on desktop and mobile browsers

### Database Schema
- **URLs Table**: id, original_url, short_code, created_at, expires_at, click_count
- **Indexes**: Index on short_code for fast lookups, index on expires_at for cleanup operations

## Technical Considerations

### Technology Stack
- **Runtime**: Node.js v18 or higher
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Caching**: Redis for short code pool and URL caching
- **Templating**: EJS
- **Styling**: Tailwind CSS
- **Logging**: Winston.js
- **Date/Time**: Moment.js
- **Error Handling**: Custom attempt.js wrapper for async operations
- **Code Style**: Standard.js linting rules
- **Testing**: Mocha, Chai, Sinon, Should, Mochawesome
- **Module System**: ES6 modules

### Architecture
- RESTful API design with clear endpoint separation
- Service layer pattern for business logic
- Repository pattern for data access
- Background job processing for URL cleanup
- Redis-first approach for short code generation

### Performance Requirements
- Handle up to 2 requests per second for normal operations
- Bulk API capable of processing 1000 URLs per request
- Response times under 100ms for cached URL redirects
- Database queries optimized with proper indexing

### Deployment
- Designed to run as a standalone service
- Docker container support
- VM deployment capability
- Environment-based configuration

## Success Metrics

1. **Functionality**: 100% of created short URLs successfully redirect to their original URLs
2. **Performance**: Average response time for URL redirects under 100ms
3. **Reliability**: 99.9% uptime for the service
4. **Capacity**: Successfully handle bulk creation of 1000 URLs without timeout
5. **Data Integrity**: Accurate click counting with no missed increments
6. **Cleanup Efficiency**: Expired URLs removed within 24 hours of expiration

## Open Questions

1. **Short Code Pool Size**: How many short codes should be pre-generated and maintained in Redis? 1000000x 5 character long short codes
2. **Default Expiration Period**: What should be the default expiration time for URLs if not specified? 6 months
3. **Cleanup Frequency**: How often should the background cleanup process run? Daily
4. **Error Retry Logic**: Should there be retry mechanisms for failed database operations? No, simply log and give error responses to the user / client.
5. **Logging Retention**: How long should logs be retained and what log rotation policy should be implemented? Logs should be sent to std out to be captured by systemd / journalctl
6. **Backup Strategy**: What backup and recovery procedures are needed for the PostgreSQL database? None