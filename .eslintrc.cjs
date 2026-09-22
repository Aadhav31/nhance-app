module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  extends: [],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['react-refresh', 'react-hooks'],
  settings: { react: { version: 'detect' } },
  rules: {},
  ignorePatterns: ['dist', 'android', 'node_modules'],
}
