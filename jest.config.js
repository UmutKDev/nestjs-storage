module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/$1',
    '^@common/(.*)$': '<rootDir>/common/$1',
    '^@entities/(.*)$': '<rootDir>/entities/$1',
    '^@modules/(.*)$': '<rootDir>/modules/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/../test/jest.setup.js'],
  testTimeout: 30000,
  verbose: true,
  clearMocks: true,
  restoreMocks: true,
}; 