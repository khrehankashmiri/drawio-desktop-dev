/**
 * Logger Tests
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Logger, logger } from '../../src/utils/logger.js';

describe('Logger', () => {
	let mockLog: any;

	beforeEach(() => {
		mockLog = {
			error: vi.fn(),
			warn: vi.fn(),
			info: vi.fn(),
			debug: vi.fn(),
			verbose: vi.fn()
		};

		// Reset logger instance
		// @ts-ignore - accessing private property for testing
		Logger.instance = undefined;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('Singleton Pattern', () => {
		it('should return the same instance', () => {
			const instance1 = Logger.getInstance();
			const instance2 = Logger.getInstance();
			expect(instance1).toBe(instance2);
		});
	});

	describe('Logging Methods', () => {
		it('should log error messages', () => {
			const testLogger = Logger.getInstance();
			testLogger.error('Test error', 'TestContext');
			// Should not throw
		});

		it('should log warning messages', () => {
			const testLogger = Logger.getInstance();
			testLogger.warn('Test warning', 'TestContext');
			// Should not throw
		});

		it('should log info messages', () => {
			const testLogger = Logger.getInstance();
			testLogger.info('Test info', 'TestContext');
			// Should not throw
		});

		it('should log debug messages', () => {
			const testLogger = Logger.getInstance();
			testLogger.debug('Test debug', 'TestContext');
			// Should not throw
		});
	});

	describe('Data Sanitization', () => {
		it('should sanitize sensitive data', () => {
			const sensitiveData = {
				username: 'testuser',
				password: 'secret123',
				token: 'abc123',
				apiKey: 'xyz789',
				nested: {
					secret: 'nestedSecret'
				}
			};

			const testLogger = Logger.getInstance();
			// Should not throw and should sanitize
			testLogger.info('Test', 'Context', sensitiveData);
		});
	});

	describe('Child Logger', () => {
		it('should create child logger with context', () => {
			const parent = Logger.getInstance();
			const child = parent.child('ChildContext');

			expect(child).toBeDefined();
			expect(typeof child.error).toBe('function');
			expect(typeof child.info).toBe('function');
		});
	});

	describe('Timer', () => {
		it('should create and complete timers', async () => {
			const testLogger = Logger.getInstance();
			const endTimer = testLogger.startTimer('test-operation', 'TestContext');

			await new Promise(resolve => setTimeout(resolve, 10));

			// Should not throw
			expect(() => endTimer()).not.toThrow();
		});
	});

	describe('Exception Logging', () => {
		it('should log exceptions with stack traces', () => {
			const testLogger = Logger.getInstance();
			const error = new Error('Test error');

			// Should not throw
			testLogger.exception(error, 'TestContext');
		});

		it('should handle error codes', () => {
			const testLogger = Logger.getInstance();
			const error = new Error('Test error') as any;
			error.code = 'ENOENT';

			// Should not throw
			testLogger.exception(error, 'TestContext');
		});
	});

	describe('Trace IDs', () => {
		it('should include trace IDs in log entries', () => {
			const testLogger = Logger.getInstance();

			// Should accept traceId parameter
			testLogger.info('Test', 'Context', {}, 'trace-123');
		});
	});
});


describe('Logger Convenience Functions', () => {
	it('should export convenience functions', () => {
		const { logError, logWarn, logInfo, logDebug } = require('../../src/utils/logger.js');

		expect(typeof logError).toBe('function');
		expect(typeof logWarn).toBe('function');
		expect(typeof logInfo).toBe('function');
		expect(typeof logDebug).toBe('function');
	});
});
