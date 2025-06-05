## Relevant Files

- `routes/web.js` - Web interface route handlers with AJAX endpoints and dependency injection
- `views/layouts/main.ejs` - Main layout template with dark theme structure and responsive design
- `views/index.ejs` - Main page container template
- `views/partials/url-form.ejs` - URL creation form component with AJAX submission
- `views/partials/url-table.ejs` - Desktop table component with infinite scroll
- `views/partials/url-cards.ejs` - Mobile card layout component
- `views/partials/toast.ejs` - Toast notification component
- `views/partials/loading.ejs` - Loading state component
- `views/errors/404.ejs` - URL not found error page
- `views/errors/500.ejs` - Server error page
- `views/errors/expired.ejs` - URL expiration page
- `public/css/styles.css` - Custom CSS with animations, responsive design, and performance optimizations
- `public/js/app.js` - Frontend JavaScript for AJAX, infinite scroll, and interactions
- `services/UrlService.js` - Backend service integration (existing, may need modifications)
- `test/integration/web.test.js` - Integration tests for web interface functionality
- `test/unit/web-routes.test.js` - Unit tests for web route handlers

### Notes

- The web interface integrates with existing UrlService methods and dependency injection pattern
- AJAX endpoints will be added to the web routes for seamless user interactions
- Templates use EJS with modular partials for better organization and maintainability
- Responsive design uses Tailwind CSS with mobile-first approach and card layouts for mobile
- All routes implement proper error handling using the `attempt.mjs` wrapper pattern

## Tasks

- [x] 1.0 Backend Route Implementation and AJAX Endpoints
  - [x] 1.1 Implement main home page route (GET /) to render index.ejs with initial URL data
  - [x] 1.2 Create AJAX endpoint for URL creation (POST /api/web/create) with JSON response
  - [x] 1.3 Create AJAX endpoint for URL deletion (DELETE /api/web/delete/:shortCode) with JSON response
  - [x] 1.4 Create AJAX endpoint for URL listing with pagination (GET /api/web/urls) for infinite scroll
  - [x] 1.5 Implement short URL redirect route (GET /:shortCode) with asynchronous click tracking
  - [x] 1.6 Add proper error handling using attempt.mjs wrapper for all routes
  - [x] 1.7 Integrate with existing UrlService methods and dependency injection pattern
  - [x] 1.8 Implement comprehensive logging for all web route operations
  - [x] 1.9 Add input validation and sanitization for all AJAX endpoints
  - [x] 1.10 Create error page routes for 404, 500, and expired URL scenarios

- [x] 2.0 Template and View System Development
  - [x] 2.1 Create main layout template (views/layouts/main.ejs) with dark theme structure
  - [x] 2.2 Add Tailwind CSS integration and responsive meta tags to main layout
  - [x] 2.3 Create main page container template (views/index.ejs)
  - [x] 2.4 Create URL creation form partial (views/partials/url-form.ejs) with expandable design
  - [x] 2.5 Create desktop table partial (views/partials/url-table.ejs) with infinite scroll container
  - [x] 2.6 Create mobile card layout partial (views/partials/url-cards.ejs)
  - [x] 2.7 Create toast notification partial (views/partials/toast.ejs) with multiple types
  - [x] 2.8 Create loading state partial (views/partials/loading.ejs) for various components
  - [x] 2.9 Create error page templates (views/errors/404.ejs, 500.ejs, expired.ejs)
  - [x] 2.10 Implement data passing system for URL lists, messages, and form persistence
  - [x] 2.11 Add responsive breakpoint handling and mobile/desktop layout switching

- [x] 3.0 Frontend JavaScript and AJAX Functionality
  - [x] 3.1 Create main JavaScript file (public/js/app.js) with modular structure
  - [x] 3.2 Implement AJAX form submission for URL creation with loading states
  - [x] 3.3 Implement AJAX deletion functionality with immediate UI updates
  - [x] 3.4 Create infinite scroll mechanism for URL listing with pagination
  - [x] 3.5 Implement toast notification system with auto-dismiss and positioning
  - [x] 3.6 Add form validation and real-time feedback for URL input
  - [x] 3.7 Create responsive layout detection and mobile/desktop view switching
  - [x] 3.8 Implement automatic form reset and collapse after successful submission
  - [x] 3.9 Add loading state management for all async operations
  - [x] 3.10 Implement error handling for AJAX calls with user-friendly messages
  - [x] 3.11 Add URL truncation and hover tooltip functionality
  - [x] 3.12 Create click count formatting and relative date display functions

- [x] 4.0 Styling and Responsive Design Implementation  
  - [x] 4.1 Implement dark theme color scheme using Tailwind CSS classes
  - [x] 4.2 Create responsive table design for desktop and iPad layouts
  - [x] 4.3 Implement card-based layout for mobile devices (<768px)
  - [x] 4.4 Style expandable form with proper focus states and validation feedback
  - [x] 4.5 Design toast notification styling with different types and positions
  - [x] 4.6 Create loading spinner and skeleton loading state styles
  - [x] 4.7 Implement hover effects and interactive element styling
  - [x] 4.8 Add proper spacing, typography, and visual hierarchy
  - [x] 4.9 Create error page styling consistent with dark theme
  - [x] 4.10 Implement mobile-specific toast positioning and animations
  - [x] 4.11 Add smooth transitions and animations for form interactions
  - [x] 4.12 Optimize CSS for performance and ensure Tailwind purging works correctly

- [ ] 5.0 Testing and Quality Assurance
  - [ ] 5.1 Create unit tests for web route handlers and AJAX endpoints
  - [ ] 5.2 Create integration tests for complete user workflows (create, list, delete)
  - [ ] 5.3 Test infinite scroll functionality with large datasets
  - [ ] 5.4 Test responsive design across desktop, iPad, and mobile breakpoints
  - [ ] 5.5 Test AJAX error handling and network failure scenarios
  - [ ] 5.6 Verify toast notification behavior and positioning on all devices
  - [ ] 5.7 Test form validation and user input edge cases
  - [ ] 5.8 Verify URL redirect functionality and click tracking accuracy
  - [ ] 5.9 Test accessibility features and keyboard navigation
  - [ ] 5.10 Perform cross-browser compatibility testing
  - [ ] 5.11 Load testing for infinite scroll and AJAX performance
  - [ ] 5.12 Manual testing of complete user journey and error recovery 