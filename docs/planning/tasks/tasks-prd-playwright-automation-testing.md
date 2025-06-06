# Tasks: Playwright Automation Testing for URL Shortening

## Relevant Files

- `test/playwright/url-shortening.spec.js` - Main Playwright test file for URL shortening flow
- `playwright.config.js` - Playwright configuration file for project settings
- `package.json` - Update to add Playwright dependency and test script
- `test/playwright/helpers/test-data.js` - Helper file for managing mock test data
- `test/playwright/page-objects/HomePage.js` - Page Object Model for homepage interactions

### Notes

- Tests will be created using the Playwright MCP server to explore the UI and generate appropriate selectors
- Use `npm run test:playwright` to run Playwright tests (script to be added to package.json)
- Tests should follow the project's ES module standards (no semicolons, const/let usage)

## Tasks

- [ ] 1.0 Project Setup and Configuration
  - [ ] 1.1 Create `/test/playwright` directory structure
  - [ ] 1.2 Review existing application UI to understand URL shortening form elements
  - [ ] 1.3 Identify the homepage route and URL input elements for test targeting
- [ ] 2.0 Install and Configure Playwright
  - [ ] 2.1 Add `@playwright/test` as a development dependency to package.json
  - [ ] 2.2 Create `playwright.config.js` with Chrome browser configuration and localhost base URL
  - [ ] 2.3 Run `npx playwright install chromium` to install Chrome browser for testing
  - [ ] 2.4 Configure test directory to point to `/test/playwright`
- [ ] 3.0 Create Test Infrastructure and Helpers
  - [ ] 3.1 Create `test/playwright/helpers/test-data.js` with mock URL data following ES module standards
  - [ ] 3.2 Create `test/playwright/page-objects/HomePage.js` using Page Object Model pattern
  - [ ] 3.3 Implement selectors and methods for URL input, form submission, and result validation
  - [ ] 3.4 Add error handling using project's attempt.mjs pattern where applicable
- [ ] 4.0 Develop Core URL Shortening Test Suite
  - [ ] 4.1 Start local development server for testing
  - [ ] 4.2 Use Playwright MCP server to navigate to homepage and explore UI elements
  - [ ] 4.3 Use MCP server to identify stable selectors for URL input field and submit button
  - [ ] 4.4 Create `test/playwright/url-shortening.spec.js` with the complete user flow test
  - [ ] 4.5 Implement test steps: navigate → input URL → submit → validate short URL → test redirect
  - [ ] 4.6 Add meaningful assertions at each step of the user journey
- [ ] 5.0 Implement Test Execution and Validation
  - [ ] 5.1 Add `"test:playwright": "playwright test"` script to package.json
  - [ ] 5.2 Run tests locally to ensure they execute successfully
  - [ ] 5.3 Verify test passes when functionality works correctly
  - [ ] 5.4 Validate that test reports provide clear pass/fail results
  - [ ] 5.5 Document test execution instructions for other developers 