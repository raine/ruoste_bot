module.exports = {
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json',
      diagnostics: false
    }
  },
  moduleFileExtensions: ['ts', 'js'],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest'
  },
  testRegex: '.*\\.test\\.ts',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/setup.js'],
  setupFilesAfterEnv: ['<rootDir>/test/setup-after.js']
}
