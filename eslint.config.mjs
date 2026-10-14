import js from '@eslint/js'
import globals from 'globals'
import vue from 'eslint-plugin-vue'

const WX_GLOBALS = {
  wx: 'readonly',
  App: 'readonly',
  Page: 'readonly',
  Component: 'readonly',
  Behavior: 'readonly',
  getApp: 'readonly',
  getCurrentPages: 'readonly',
  requirePlugin: 'readonly'
}

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '.vite/**',
      'server/data.json',
      'server/data.json.bak',
      'server/uploads/**',
      'server/secrets/**',
      'miniprogram/project.private.config.json'
    ]
  },
  js.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    rules: {
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }
      ],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-control-regex': 'off'
    }
  },
  {
    files: ['server/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node
    }
  },
  {
    files: ['admin/**/*.js', 'admin/**/*.vue', 'merchant/**/*.js', 'merchant/**/*.vue'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.browser
    }
  },
  {
    files: ['miniprogram/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node, ...WX_GLOBALS }
    }
  }
]
