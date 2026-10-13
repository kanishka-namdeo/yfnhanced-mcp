export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          module: 'commonjs'
        }
      }
    ]
  },
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  // Tests whose describe title carries LIVE_MARKER call Yahoo Finance and are excluded from
  // `npm test`; `npm run test:live` (jest.live.config.js) runs exactly them. The marker string is
  // the contract — a live case that loses it from its name silently joins the CI gate.
  testNamePattern: '^(?!.*live market data)',
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts',
    '**/tests/**/*.test.ts'
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/**/index.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html',
    'json'
  ],
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    }
  },
  testTimeout: 30000,
  verbose: true
};
