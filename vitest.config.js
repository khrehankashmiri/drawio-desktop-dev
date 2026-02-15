import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		include: ['tests/unit/**/*.test.js', 'tests/unit/**/*.spec.js'],
		exclude: ['node_modules', 'dist', 'drawio'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			exclude: [
				'node_modules/',
				'drawio/',
				'dist/',
				'tests/',
				'**/*.config.js',
				'src/main/electron.js' // Legacy file
			]
		},
		setupFiles: ['./tests/unit/setup.js'],
		mockReset: true,
		restoreMocks: true
	},
	resolve: {
		alias: {
			'@': '/src',
			'@utils': '/src/utils',
			'@services': '/src/services',
			'@ipc': '/src/ipc'
		}
	}
});
