export default {
    testEnvironment: 'node',
    preset: 'ts-jest/presets/default-esm',
    testPathIgnorePatterns: ['/node_modules/', '/.history/', '/build/'],
    transform: {
        '^.+\\.m?[tj]s?$': ['ts-jest', { useESM: true }],
    },
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.(m)?js$': '$1',
    },
    testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.(m)?ts$',
    coverageDirectory: 'coverage',
    collectCoverageFrom: ['src/**/*.ts', 'src/**/*.mts', '!src/**/*.d.ts', '!src/**/*.d.mts'],
};
