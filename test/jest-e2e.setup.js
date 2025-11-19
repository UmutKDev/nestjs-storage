// Global test setup for E2E tests
process.env.NODE_ENV = 'test';

// Increase timeout for E2E tests
jest.setTimeout(60000);

// Mock environment variables for E2E testing
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

// Global E2E test utilities
global.e2eUtils = {
  // Helper to create test app instance
  createTestApp: async () => {
    const { Test, TestingModule } = require('@nestjs/testing');
    const { AppModule } = require('../src/app.module');
    
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const app = moduleFixture.createNestApplication();
    await app.init();
    
    return app;
  },
  
  // Helper to create authenticated request
  createAuthenticatedRequest: (app, user = null) => {
    const request = require('supertest');
    const req = request(app.getHttpServer());
    
    if (user) {
      // Add authentication headers if user is provided
      // This would need to be implemented based on your auth strategy
      return req.set('Authorization', `Bearer ${user.token}`);
    }
    
    return req;
  },
  
  // Helper to clean up test data
  cleanupTestData: async (app) => {
    // Clean up any test data created during tests
    // This would need to be implemented based on your data layer
    const dataSource = app.get('DataSource');
    if (dataSource) {
      // Add cleanup logic here
    }
  },
}; 