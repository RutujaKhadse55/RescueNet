module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  moduleNameMapper: {
    '^@rescuenet/core$': '<rootDir>/../../packages/core/src/index.ts',
    '^libsodium-wrappers$': '<rootDir>/src/shims/libsodium.ts',
  },
};
