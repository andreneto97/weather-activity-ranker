import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    // Strip `.js` from relative imports so Jest resolves the matching `.ts` source
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@wa/contracts$': '<rootDir>/../contracts/src/index.ts',
  },
  transform: {
    '^.+\\.(t|j)sx?$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript', tsx: false },
          target: 'es2022',
        },
        module: { type: 'es6' },
      },
    ],
  },
  testMatch: ['**/*.test.ts', '**/tests/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    '!src/**/__fixtures__/**',
    '!src/scripts/**',
  ],
  coverageThreshold: {
    global: { lines: 80, functions: 80, branches: 75, statements: 80 },
    './src/domain/scoring/': { lines: 95, functions: 95, branches: 90, statements: 95 },
    './src/adapters/outbound/': { lines: 85, functions: 85, branches: 80, statements: 85 },
  },
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.ts'],
};

export default config;
