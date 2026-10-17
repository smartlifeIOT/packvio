/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testRegex: '.*\\.spec\\.tsx?$',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  moduleNameMapper: {
    // Mirrors the `paths` in tsconfig.json — jest does not read them.
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@packvio/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@packvio/shared/(.*)$': '<rootDir>/../../packages/shared/src/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }],
  },
  clearMocks: true,
};
