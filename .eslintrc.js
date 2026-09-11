import { defineConfig } from 'eslint'

export default defineConfig({
  extends: [
    'eslint:recommended',
    'plugin:prettier/recommended', // Integrates Prettier with ESLint
  ],
  plugins: ['prettier'],
  parserOptions: {
    ecmaVersion: 2020,  // Enables ES6+ syntax
    sourceType: 'module', // Allows using `import`/`export`
  },
  rules: {
    'prettier/prettier': 'error', // Treat Prettier issues as errors
    'no-console': 'warn',  // Warn about console statements
    'no-debugger': 'warn', // Warn about debugger statements
  },
})