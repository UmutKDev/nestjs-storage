// Global test setup for unit and integration tests
process.env.NODE_ENV = 'test';

// Increase timeout for all tests
jest.setTimeout(30000);

// Mock environment variables for testing
process.env.PG_HOSTNAME = 'localhost';
process.env.PG_PORT = '5432';
process.env.PG_USERNAME = 'test_user';
process.env.PG_PASSWORD = 'test_password';
process.env.PG_DATABASE = 'test_db';
process.env.PG_SCHEMA = 'public';
process.env.PG_SSL = 'false';

// AWS/S3 test environment variables
process.env.AWS_ACCESS_KEY_ID = 'test_access_key';
process.env.AWS_SECRET_ACCESS_KEY = 'test_secret_key';
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_S3_BUCKET = 'test-bucket';
process.env.AWS_S3_ENDPOINT = 'http://localhost:9000';
process.env.AWS_CLOUDFRONT_ENDPOINT = 'https://test.cloudfront.net';

// JWT test environment variables
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.JWT_EXPIRES_IN = '1h';

// App test environment variables
process.env.PORT = '3001';
process.env.API_PREFIX = '/api/v1';

// Suppress console logs during tests unless explicitly needed
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  // Suppress console output during tests
  console.log = jest.fn();
  console.error = jest.fn();
  console.warn = jest.fn();
});

afterAll(() => {
  // Restore console output
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

// Global test utilities
global.testUtils = {
  // Helper to create test data
  createTestUser: (overrides = {}) => ({
    id: 1,
    email: 'test@example.com',
    password: 'hashedPassword',
    firstName: 'Test',
    lastName: 'User',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),
  
  // Helper to create test organization
  createTestOrganization: (overrides = {}) => ({
    id: 1,
    name: 'Test Organization',
    description: 'Test organization description',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),
  
  // Helper to create test branch
  createTestBranch: (overrides = {}) => ({
    id: 1,
    name: 'Test Branch',
    address: 'Test Address',
    phone: '+1234567890',
    isActive: true,
    organizationId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),
}; 