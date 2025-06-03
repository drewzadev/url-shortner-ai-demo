## Relevant Files

- `package.json` - Project dependencies and scripts configuration
- `url-shortener.js` - Main Express server entry point
- `libs/attempt.mjs` - Error handling wrapper utility (already exists)
- `config/database.js` - Database connection configuration
- `config/redis.js` - Redis connection configuration
- `config/logger.js` - Winston logger configuration
- `prisma/schema.prisma` - Database schema definition
- `services/UrlService.js` - Core URL shortening business logic
- `services/ShortCodeService.js` - Short code generation and management
- `services/RedisService.js` - Redis operations wrapper
- `controllers/ApiController.js` - REST API endpoint handlers
- `controllers/WebController.js` - Web interface route handlers
- `routes/api.js` - API route definitions
- `routes/web.js` - Web interface route definitions
- `jobs/CleanupJob.js` - Background job for URL expiration cleanup
- `views/layouts/main.ejs` - Main EJS layout template
- `views/index.ejs` - Home page with URL creation form
- `views/list.ejs` - URL listing page
- `public/css/styles.css` - Tailwind CSS styles
- `middleware/logging.js` - Request logging middleware
- `middleware/errorHandler.js` - Global error handling middleware
- `utils/validators.js` - URL validation utilities
- `test/services/UrlService.test.js` - Unit tests for URL service
- `test/services/ShortCodeService.test.js` - Unit tests for short code service
- `test/controllers/ApiController.test.js` - Unit tests for API controller
- `test/controllers/WebController.test.js` - Unit tests for web controller
- `test/integration/api.test.js` - Integration tests for API endpoints
- `test/integration/web.test.js` - Integration tests for web interface

### Notes

- Unit tests should be placed in the `test/` directory with corresponding folder structure
- Use `npm test` to run all tests via Mocha
- Use `npm run lint` to run StandardJS linting
- Environment variables should be configured in `.env` file
- Redis should be pre-populated with short codes on application startup

## Tasks

- [ ] 1.0 Project Setup & Configuration
  - [ ] 1.1 Initialize npm project and install core dependencies (express, prisma, redis, winston, moment, ejs, standard)
  - [ ] 1.2 Install development dependencies (mocha, chai, sinon, should, mochawesome, nodemon)
  - [ ] 1.3 Create project directory structure (config/, services/, controllers/, routes/, views/, public/, middleware/, utils/, jobs/, test/)
  - [ ] 1.4 Setup package.json scripts for start, dev, test, lint, and database operations
  - [ ] 1.5 Create .env.example file with all required environment variables
  - [ ] 1.6 Setup .gitignore file for Node.js project (node_modules, .env, logs, etc.)
  - [ ] 1.7 Configure StandardJS linting with .eslintrc or package.json rules
  - [ ] 1.8 Setup basic Express server entry point (url-shortener.js) with middleware loading
  - [ ] 1.9 Create Dockerfile for containerized deployment
  - [ ] 1.10 Setup basic logging configuration with Winston and log levels
- [ ] 2.0 Database Schema & Models Setup
  - [ ] 2.1 Initialize Prisma in the project and configure for PostgreSQL
  - [ ] 2.2 Create Prisma schema with URLs model (id, original_url, short_code, created_at, expires_at, click_count)
  - [ ] 2.3 Add database indexes for short_code (unique) and expires_at for performance optimization
  - [ ] 2.4 Create database connection configuration in config/database.js
  - [ ] 2.5 Generate Prisma client and configure for ES6 modules
  - [ ] 2.6 Create initial database migration with npx prisma migrate dev
  - [ ] 2.7 Setup database seeding script for development/testing data
  - [ ] 2.8 Add database health check endpoint for monitoring
  - [ ] 2.9 Configure database connection pooling and timeout settings
  - [ ] 2.10 Test database connectivity and basic CRUD operations
- [ ] 3.0 Redis Integration & Short Code Management
- [ ] 4.0 Core API Development
- [ ] 5.0 Web Interface Development
- [ ] 6.0 Background Job System
- [ ] 7.0 Testing & Quality Assurance
