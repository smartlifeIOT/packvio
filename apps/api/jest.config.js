/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  // Probes Postgres before collection so the database-backed suite can choose
  // describe vs describe.skip at collection time. See test/setup-db.ts.
  setupFilesAfterEnv: ['<rootDir>/test/setup-db.ts'],
  moduleNameMapper: {
    '^@packvio/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@packvio/shared/(.*)$': '<rootDir>/../../packages/shared/src/$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  clearMocks: true,
};
