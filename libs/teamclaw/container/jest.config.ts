/* eslint-disable */
// Pure-JS container scripts — bypass the @nx/jest preset's ts-jest transform
// because this library has no TypeScript sources.
const config = {
  displayName: 'lib-teamclaw-container',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/scripts/*.spec.js'],
  moduleFileExtensions: ['js', 'json'],
  transform: {},
  coverageDirectory: '../../../coverage/libs/teamclaw/container',
  clearMocks: true,
  restoreMocks: true,
};

export default config;
