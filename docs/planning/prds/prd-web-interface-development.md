# Product Requirements Document: Web Interface Development

## Introduction/Overview

This document outlines the requirements for developing the web interface component of the URL Shortener service. The web interface will provide a user-friendly way to create shortened URLs and manage existing ones through a single-page interface built with EJS templates and styled with Tailwind CSS. The interface will use AJAX for seamless interactions and implement infinite scroll for URL listing. This feature is a critical component of the overall URL Shortener service, providing visual access to the core functionality previously available only through API endpoints.

## Goals

1. Create a responsive single-page web interface for URL management with AJAX interactions
2. Implement an expandable form for URL creation with real-time feedback and automatic form reset
3. Display all shortened URLs with infinite scroll and card-based mobile layout
4. Enable seamless URL deletion functionality through AJAX calls
5. Provide real-time feedback through position-adaptive toast notifications
6. Ensure mobile-friendly design with card layouts and adaptive UI elements
7. Integrate with existing backend API endpoints through AJAX calls

## User Stories

1. **As a user, I want to access all URL management features from a single page** so that I can efficiently manage my shortened URLs without navigating between different pages.

2. **As a user, I want to click a "Create Short URL" button to expand a form** so that I can create new shortened URLs when needed without visual clutter when not in use.

3. **As a user, I want to see all my shortened URLs in a table** so that I can quickly review my existing links with their details.

4. **As a user, I want to see truncated long URLs with hover tooltips** so that I can save screen space while still being able to view the full original URL when needed.

5. **As a user, I want to see formatted click counts and relative dates** so that I can easily understand the usage and age of my URLs.

6. **As a user, I want to click on short URLs to test them** so that I can verify they work correctly by opening them in a new tab.

7. **As a user, I want to delete URLs with a simple click** so that I can quickly remove unwanted links without unnecessary confirmation dialogs.

8. **As a user, I want to see toast notifications for success and errors** so that I get immediate feedback on my actions.

9. **As a mobile user, I want the interface to work well on my device** so that I can manage URLs from anywhere.

## Functional Requirements

### Page Layout and Structure
1. The system must provide a single-page interface that combines URL creation and listing functionality.
2. The page must display a "Create Short URL" button that expands a form when clicked.
3. The page must display a table listing all existing shortened URLs below the creation section.
4. The interface must use EJS templates for server-side rendering.
5. The interface must be styled with Tailwind CSS for modern, clean aesthetics.

### URL Creation Form
6. The form must include an input field for entering the original URL.
7. The form must include a submit button to create the shortened URL.
8. The form must implement basic client-side URL format validation.
9. The form must display a loading spinner/state during URL creation.
10. The form must collapse and reset automatically after successful URL creation.
11. The form must remain expanded and show error messages if creation fails.
12. The form must use AJAX for submission without page refreshes.

### URL Listing Table
13. The table must display columns for: Original URL, Short URL, Creation Date, and Click Count.
14. Original URLs must be truncated to 25 characters with "..." and show full URL on hover.
15. Short URLs must be displayed as clickable links that open in new tabs.
16. Creation dates must show relative time (e.g., "2 days ago") for dates within a week, then switch to DD-MM-YYYY format.
17. Click counts must be formatted with appropriate number formatting (e.g., "1,234" for thousands).
18. URLs must be listed in chronological order (newest first).
19. Each row must include a delete button for URL removal that uses AJAX calls.
20. The table must implement infinite scroll for loading additional URLs.
21. The table must show a loading state during initial data load and infinite scroll operations.
22. When no URLs exist, the table area must display a message: "No URLs found. Use the 'Create Short URL' button to add your first URL."

### Mobile Responsive Design
23. The interface must use card-based layout for mobile devices (<768px) instead of table format.
24. Cards must display the same information as table rows but in a stacked, mobile-friendly format.
25. Desktop and iPad views must maintain the table layout with responsive column adjustments.

### User Feedback System
26. The system must display toast notifications for successful URL creation, deletion, and errors.
27. Toast notifications must be positioned at top-right on desktop and differently positioned on mobile for better visibility.
28. Toast notifications must automatically dismiss after 3-5 seconds.
29. All user actions must provide immediate visual feedback through AJAX responses.

### URL Redirect Functionality
30. The `/:shortCode` route must implement asynchronous click tracking for optimal performance.
31. URL redirects must handle expired or non-existent URLs with appropriate error pages using the same dark theme.

### Integration Requirements
32. The form must submit to the existing `/create` POST route.
33. The delete buttons must submit to the existing `/delete/:shortCode` POST route.
34. The page must load URL data from the database through the existing web routes.
35. Short URL links must redirect through the existing `/:shortCode` GET route.

### Backend Integration Requirements
36. All web routes must be implemented simultaneously following the existing dependency injection pattern.
37. The home page (`GET /`) must render the main template and provide initial URL data.
38. AJAX endpoints must be created for:
    - `POST /api/web/create` - URL creation via AJAX
    - `DELETE /api/web/delete/:shortCode` - URL deletion via AJAX  
    - `GET /api/web/urls` - URL listing with pagination/infinite scroll support
39. The short URL redirect route (`GET /:shortCode`) must implement asynchronous click tracking.
40. All AJAX endpoints must return JSON responses with proper error handling.
41. Integration with existing `UrlService` methods must be maintained.

### Template and View Requirements  
42. Create separate template files for modular organization:
    - `views/layouts/main.ejs` - Main layout with dark theme structure
    - `views/index.ejs` - Main page container  
    - `views/partials/url-form.ejs` - URL creation form component
    - `views/partials/url-table.ejs` - Desktop table component
    - `views/partials/url-cards.ejs` - Mobile card layout component
    - `views/partials/toast.ejs` - Toast notification component
    - `views/partials/loading.ejs` - Loading state component
43. Error page templates must follow the same dark theme:
    - `views/errors/404.ejs` - URL not found page
    - `views/errors/500.ejs` - Server error page
    - `views/errors/expired.ejs` - URL expiration page
44. All templates must support the dark mode color scheme and responsive design.

## Non-Goals (Out of Scope)

1. **Advanced Form Features**: No drag-and-drop URL input, bulk upload interface, or URL preview functionality.
2. **Copy-to-Clipboard**: No copy buttons or clipboard integration for short URLs.
3. **Advanced Table Features**: No sorting, filtering, search, or pagination capabilities.
4. **Delete Confirmation**: No confirmation dialogs or modals for URL deletion.
5. **Real-time Updates**: No WebSocket or polling for real-time URL list updates.
6. **Advanced Animations**: No complex CSS animations beyond basic transitions.
7. **URL Editing**: No ability to modify existing URLs after creation.
8. **Batch Operations**: No multi-select or batch delete functionality.

## Design Considerations

### User Interface Design
- **Color Scheme**: Use the dark mode color scheme found in the example ui picture file at 'docs/planning/ui-example.png'
  - Primary background: Dark slate (`bg-slate-800` or `bg-gray-900`)
  - Secondary background: Lighter slate for alternating table rows (`bg-slate-700/50`)
  - Text colors: White primary text (`text-white`), light gray secondary (`text-gray-300`)
  - Borders: Subtle gray borders (`border-gray-600/30`)
  - Success states: Green badges/buttons (`bg-green-500`)
  - Error states: Red badges/buttons (`bg-red-500`) 
  - Neutral states: Gray badges (`bg-gray-500`)
- **Typography**: Clean, readable fonts with proper hierarchy (h1, h2, body text) using white/light gray text
- **Spacing**: Consistent padding and margins following Tailwind spacing scale with generous whitespace
- **Forms**: Dark form inputs with light borders and white text, proper focus states with blue accent
- **Buttons**: Rounded buttons with subtle shadows, hover states with brightness increases
- **Table**: Dark table design with alternating row colors (slate-800/slate-700), proper column alignment
- **Status Indicators**: Rounded pill-style badges for different states (active, inactive, etc.)

### Responsive Layout
- **Desktop**: Full-width layout with spacious table columns, dark sidebar navigation
- **iPad**: Maintain table structure with adjusted column widths, collapsible sidebar
- **Mobile**: Card-based layout instead of table, mobile-optimized navigation and toast positioning

### Toast Notification Design  
- **Desktop Position**: Top-right corner of the viewport
- **Mobile Position**: Top-center or bottom-center for better mobile visibility and accessibility
- **Duration**: 3-5 seconds auto-dismiss
- **Styling**: Dark background (`bg-slate-800`) with appropriate colored left border (green/red/blue)
- **Types**: Success (green border), Error (red border), Info (blue border)
- **Animation**: Smooth slide-in/slide-out transitions with different animations for mobile vs desktop

## Technical Considerations

### Frontend Technologies
- **Templates**: EJS with modular partial templates for component organization
- **Styling**: Tailwind CSS classes with responsive utilities and mobile-first approach
- **JavaScript**: Vanilla JavaScript for AJAX calls, infinite scroll, form interactions, and toast notifications
- **Icons**: Tailwind UI Heroicons or similar for consistent iconography
- **AJAX**: Native Fetch API for all asynchronous operations

### Backend Integration
- **Route Handlers**: Simultaneous implementation of all web routes with dependency injection
- **AJAX Endpoints**: New API endpoints specifically for web interface AJAX calls
- **Data Handling**: JSON responses for AJAX calls, EJS rendering for initial page load
- **Form Processing**: AJAX form submissions with JSON responses
- **URL Validation**: Client-side validation with backend validation backup
- **Service Integration**: Use existing `UrlService` class methods:
  - `createShortUrl(url)` for URL creation
  - `deleteUrl(shortCode)` for URL deletion  
  - `getUrlByShortCode(shortCode)` for redirects with async click tracking
  - `getAllUrls()` for listing all URLs with infinite scroll support
- **Error Handling**: Implement `attempt.mjs` wrapper pattern for all async operations
- **Logging**: Use dependency-injected logger with appropriate log levels and prefixes

### Performance Considerations
- **Infinite Scroll**: Implement efficient pagination with reasonable page sizes (20-50 URLs per load)
- **AJAX Optimization**: Minimize payload sizes and implement proper loading states
- **CSS**: Use Tailwind's purge functionality to minimize CSS bundle size
- **JavaScript**: Minimal vanilla JS to avoid framework overhead while supporting AJAX functionality
- **Caching**: Leverage browser caching for static assets and implement appropriate cache headers
- **Async Operations**: Use asynchronous click tracking to maintain fast redirect performance

### Browser Compatibility
- **Modern Browsers**: Chrome, Firefox, Safari, Edge (latest 2 versions)
- **Mobile Browsers**: iOS Safari, Chrome Mobile, Samsung Internet
- **JavaScript**: ES6+ features with consideration for older browser support

## Success Metrics

1. **Usability**: Users can create a short URL in under 5 seconds using AJAX forms
2. **Responsiveness**: Interface loads and functions properly on all target screen sizes with appropriate layouts (table vs cards)
3. **Performance**: Infinite scroll loads additional URLs in under 1 second
4. **Mobile Experience**: Card-based mobile layout provides intuitive URL management
5. **User Feedback**: Toast notifications appear within 500ms of user actions
6. **Accessibility**: All interactive elements work properly with touch and keyboard inputs
7. **Functionality**: 100% of core features (create, list, delete, redirect) work seamlessly through AJAX 