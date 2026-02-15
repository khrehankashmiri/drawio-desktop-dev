/**
 * ESLint Configuration for draw.io Desktop
 * Enforces code quality, security best practices, and Electron-specific rules
 */
module.exports = {
	root: true,
	env: {
		browser: true,
		commonjs: true,
		es2021: true,
		node: true,
	},
	extends: [
		'eslint:recommended',
		'plugin:import/recommended',
	],
	plugins: ['import', 'security'],
	parserOptions: {
		ecmaVersion: 2022,
		sourceType: 'module',
	},
	globals: {
		__DEV__: 'readonly',
	},
	rules: {
		// Code Quality
		'no-console': ['warn', { allow: ['error', 'warn'] }],
		'no-debugger': 'error',
		'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
		'no-duplicate-imports': 'error',
		'prefer-const': 'error',
		'no-var': 'error',
		'object-shorthand': 'error',
		'prefer-template': 'error',
		'template-curly-spacing': 'error',

		// Security Rules
		'security/detect-eval-with-expression': 'error',
		'security/detect-non-literal-fs-filename': 'error',
		'security/detect-unsafe-regex': 'error',
		'security/detect-buffer-noassert': 'error',
		'security/detect-child-process': 'error',
		'security/detect-disable-mustache-escape': 'error',
		'security/detect-new-buffer': 'error',
		'security/detect-no-csrf-before-method-override': 'error',
		'security/detect-non-literal-regexp': 'error',
		'security/detect-non-literal-require': 'error',
		'security/detect-object-injection': 'warn',
		'security/detect-possible-timing-attacks': 'error',
		'security/detect-pseudoRandomBytes': 'error',

		// Import Rules
		'import/no-unresolved': 'error',
		'import/named': 'error',
		'import/default': 'error',
		'import/namespace': 'error',
		'import/no-absolute-path': 'error',
		'import/no-dynamic-require': 'error',
		'import/no-self-import': 'error',
		'import/no-cycle': 'error',
		'import/no-useless-path-segments': 'error',
		'import/no-mutable-exports': 'error',

		// Error Handling
		'no-throw-literal': 'error',
		'prefer-promise-reject-errors': 'error',
		'require-atomic-updates': 'error',

		// Style (matching existing codebase)
		'indent': ['error', 'tab'],
		'quotes': ['error', 'single', { avoidEscape: true }],
		'semi': ['error', 'always'],
		'brace-style': ['error', 'allman', { allowSingleLine: true }],
		'comma-dangle': ['error', 'never'],
		'no-trailing-spaces': 'error',
		'eol-last': 'error',
		'max-len': ['warn', { code: 120, ignoreUrls: true, ignoreStrings: true }],
	},
	overrides: [
		{
			files: ['tests/**/*.js'],
			env: {
				node: true,
			},
			rules: {
				'no-console': 'off',
				'no-unused-vars': 'off',
			},
		},
	],
	ignorePatterns: [
		'dist/',
		'drawio/',
		'node_modules/',
		'*.min.js',
		'build/',
	],
};
