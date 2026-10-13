import base from './jest.config.js';

// The cases `npm test` filters out by name. Only the files that actually contain a
// "live market data" group are listed: a suite whose every test is filtered out would
// fail with "Your test suite must contain at least one test".
export default {
  ...base,
  testMatch: [
    '<rootDir>/tests/e2e/server.e2e.test.ts',
    '<rootDir>/tests/e2e/tool-execution.e2e.test.ts',
    '<rootDir>/tests/e2e/resource-access.e2e.test.ts'
  ],
  testNamePattern: 'live market data'
};
