# PRD: Playwright Automation Testing for URL Shortening

## Introduction/Overview

This feature aims to implement end-to-end (E2E) automation testing using Playwright to test the user interface flow of the URL shortening functionality. The primary goal is to prevent regressions in the UI functionality by automating the core user journey from entering a long URL to receiving and validating a shortened URL.

This testing suite will complement the existing unit and integration tests by providing comprehensive UI validation to ensure the user-facing functionality works as expected after code changes.

## Goals

1. **Prevent UI Regressions**: Automatically detect when changes break the core URL shortening user flow
2. **Validate User Journey**: Ensure the complete user experience works end-to-end
3. **Improve Development Confidence**: Provide developers with automated feedback on UI functionality
4. **Establish Testing Foundation**: Create a base for future E2E testing expansion

## User Stories

**As a developer**, I want automated UI tests so that I can confidently deploy changes without breaking the core URL shortening functionality.

**As a developer**, I want to run tests locally so that I can validate my changes before committing code.

**As a QA engineer**, I want reliable automated tests so that I can focus on exploratory testing rather than repetitive manual validation.

## Functional Requirements

1. **Test Environment Setup**: The system must be able to run Playwright tests against a local development environment. The process to create these tests must use the Playwright MCP tool available.
2. **Browser Testing**: The system must execute tests in desktop Chrome browser
3. **Homepage Navigation**: The test must navigate to the application homepage
4. **URL Input**: The test must be able to enter a long URL into the input field
5. **Form Submission**: The test must be able to submit the URL shortening form
6. **Short URL Generation**: The test must validate that a shortened URL is generated and displayed
7. **Redirect Validation**: The test must verify that the shortened URL redirects to the original long URL
8. **Test Data Management**: The system must use mock/test data rather than real URLs
9. **Test Execution**: The tests must be runnable from the command line for local development
10. **Test Reporting**: The system must provide clear pass/fail results and error details

## Non-Goals (Out of Scope)

- API endpoint testing (covered by existing integration tests)
- Negative scenario testing (invalid URLs, error handling)
- Authentication testing (no authentication required)
- Multi-browser testing (Chrome only for initial implementation)
- Mobile device testing
- CI/CD pipeline integration
- Performance testing
- Accessibility testing
- Cross-platform testing (beyond desktop Chrome)

## Design Considerations

- **Test Structure**: Follow Playwright best practices with Page Object Model for maintainability
- **Test Data**: Use predictable test URLs that can be easily validated
- **Selectors**: Use stable selectors (data-testid attributes preferred) to avoid brittle tests
- **Assertions**: Include meaningful assertions at each step of the user journey
- **Test Organization**: Group related tests logically and use descriptive test names

## Technical Considerations

- **Integration with Existing Codebase**: Should follow the project's coding standards (ES modules, no semicolons, etc.)
- **Dependencies**: Add Playwright as a development dependency.
- **Test Creation**: Use the Playwright MCP server available to create tests.
- **Test Environment**: Tests should run against localhost development server
- **Test Data Cleanup**: Ensure tests don't pollute the development database
- **Configuration**: Create Playwright configuration file following project conventions
- **Error Handling**: Use the project's attempt.mjs pattern for async operations where applicable

## Success Metrics

1. **Test Execution**: Tests run successfully without manual intervention
2. **Test Reliability**: Tests pass consistently when functionality is working correctly
3. **Test Coverage**: Core user journey is fully covered (homepage → URL input → short URL creation → redirect validation)
4. **Development Workflow**: Developers can easily run tests locally as part of their workflow
5. **Regression Detection**: Tests catch UI regressions when they occur

## Test Scenarios

### Primary Test Case: "Complete URL Shortening Flow"
1. Navigate to homepage
2. Enter a test long URL (e.g., "https://www.example.com/very/long/path/to/resource")
3. Submit the form
4. Verify short URL is displayed
5. Navigate to the short URL
6. Verify redirect to original long URL

### Test Data Examples
- Long URL: `https://www.example.com/test/path/for/automation`
- Expected behavior: Generate short URL, successful redirect

## Open Questions

1. Should we add data-testid attributes to existing UI elements for more stable selectors? No
2. Do we need to seed specific test data in the database for consistent testing? No
3. Should we include screenshot capture on test failures for debugging? No
4. What is the preferred test file naming convention for this project? You decide
5. Should we create a separate test script in package.json for running Playwright tests? Yes

## Implementation Notes

- Follow project's logging standards using Winston logger
- Use project's error handling pattern with attempt.mjs
- Maintain consistency with existing test structure in the `/test` directory
- Consider creating tests under `/test/playwright` directory
- Use the Playwrite MCP server to explore the UI and create the tests
- Ensure tests can be run independently without affecting other test suites 