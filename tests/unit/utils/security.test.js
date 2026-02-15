/**
 * Security Utilities Tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	isValidPath,
	isOutsideAppDir,
	validateFileSize,
	isAllowedExtension,
	validateFileContent,
	sanitizeFilename,
	generateSecureId,
	RateLimiter,
	SECURITY_CONFIG
} from '../../src/utils/security.js';

describe('Security Utilities', () => {
	describe('isValidPath', () => {
		it('should accept paths within allowed prefixes', () => {
			const allowedPrefixes = ['/home/user/documents', '/tmp'];
			expect(isValidPath('/home/user/documents/file.drawio', allowedPrefixes)).toBe(true);
			expect(isValidPath('/tmp/test.xml', allowedPrefixes)).toBe(true);
		});

		it('should reject paths outside allowed prefixes', () => {
			const allowedPrefixes = ['/home/user/documents'];
			expect(isValidPath('/etc/passwd', allowedPrefixes)).toBe(false);
			expect(isValidPath('/root/.ssh/id_rsa', allowedPrefixes)).toBe(false);
		});

		it('should reject paths with directory traversal', () => {
			const allowedPrefixes = ['/home/user/documents'];
			expect(isValidPath('/home/user/documents/../../../etc/passwd', allowedPrefixes)).toBe(false);
		});

		it('should reject very long paths', () => {
			const allowedPrefixes = ['/home'];
			const longPath = '/home/' + 'a'.repeat(5000);
			expect(isValidPath(longPath, allowedPrefixes)).toBe(false);
		});

		it('should reject paths with suspicious patterns', () => {
			const allowedPrefixes = ['/home'];
			expect(isValidPath('/home/file<script>alert(1)</script>', allowedPrefixes)).toBe(false);
			expect(isValidPath('/home/filejavascript:', allowedPrefixes)).toBe(false);
		});
	});

	describe('isOutsideAppDir', () => {
		it('should return true for user directories', () => {
			expect(isOutsideAppDir('/home/user/documents/file.drawio')).toBe(true);
			expect(isOutsideAppDir('C:\\Users\\User\\Documents\\file.drawio')).toBe(true);
		});
	});

	describe('validateFileSize', () => {
		it('should validate files under max size', () => {
			// Mock fs.existsSync and fs.statSync
			const fs = require('fs');
			fs.existsSync.mockReturnValue(true);
			fs.statSync.mockReturnValue({ size: 1024 * 1024 }); // 1MB

			expect(validateFileSize('/test/file.drawio')).toBe(true);
		});

		it('should reject files over max size', () => {
			const fs = require('fs');
			fs.existsSync.mockReturnValue(true);
			fs.statSync.mockReturnValue({ size: SECURITY_CONFIG.MAX_FILE_SIZE + 1 });

			expect(validateFileSize('/test/large-file.drawio')).toBe(false);
		});

		it('should return true for non-existent files', () => {
			const fs = require('fs');
			fs.existsSync.mockReturnValue(false);

			expect(validateFileSize('/test/new-file.drawio')).toBe(true);
		});
	});

	describe('isAllowedExtension', () => {
		it('should accept allowed extensions', () => {
			expect(isAllowedExtension('/test/file.drawio')).toBe(true);
			expect(isAllowedExtension('/test/file.png')).toBe(true);
			expect(isAllowedExtension('/test/file.svg')).toBe(true);
			expect(isAllowedExtension('/test/file.xml')).toBe(true);
		});

		it('should reject disallowed extensions', () => {
			expect(isAllowedExtension('/test/file.exe')).toBe(false);
			expect(isAllowedExtension('/test/file.bat')).toBe(false);
			expect(isAllowedExtension('/test/file.sh')).toBe(false);
		});

		it('should support custom extension lists', () => {
			const customExts = ['.custom', '.plugin'];
			expect(isAllowedExtension('/test/file.custom', customExts)).toBe(true);
			expect(isAllowedExtension('/test/file.exe', customExts)).toBe(false);
		});
	});

	describe('validateFileContent', () => {
		it('should validate text content', () => {
			const content = 'Hello, World!';
			expect(validateFileContent(content)).toBe(true);
		});

		it('should validate buffer content', () => {
			const content = Buffer.from('Test content');
			expect(validateFileContent(content)).toBe(true);
		});

		it('should reject oversized content', () => {
			const largeContent = 'x'.repeat(SECURITY_CONFIG.MAX_FILE_SIZE + 1);
			expect(validateFileContent(largeContent)).toBe(false);
		});

		it('should reject suspicious content', () => {
			expect(validateFileContent('content with <script>alert(1)</script>')).toBe(false);
			expect(validateFileContent('content with javascript:alert(1)')).toBe(false);
		});
	});

	describe('sanitizeFilename', () => {
		it('should remove path separators', () => {
			expect(sanitizeFilename('path/to/file.txt')).toBe('pathtofile.txt');
			expect(sanitizeFilename('path\\to\\file.txt')).toBe('pathtofile.txt');
		});

		it('should remove dangerous characters', () => {
			expect(sanitizeFilename('file<name>.txt')).toBe('file name .txt');
			expect(sanitizeFilename('file:name|*.txt')).toBe('file name .txt');
		});

		it('should replace multiple spaces with single space', () => {
			expect(sanitizeFilename('file    name.txt')).toBe('file name.txt');
		});

		it('should limit filename length', () => {
			const longName = 'a'.repeat(300);
			const result = sanitizeFilename(longName);
			expect(result.length).toBeLessThanOrEqual(255);
		});

		it('should handle empty or dot-only names', () => {
			expect(sanitizeFilename('')).toBe('unnamed');
			expect(sanitizeFilename('...')).toBe('unnamed');
			expect(sanitizeFilename('   ')).toBe('unnamed');
		});
	});

	describe('generateSecureId', () => {
		it('should generate IDs of specified length', () => {
			const id16 = generateSecureId(16);
			const id32 = generateSecureId(32);

			expect(id16.length).toBe(16);
			expect(id32.length).toBe(32);
		});

		it('should generate unique IDs', () => {
			const id1 = generateSecureId();
			const id2 = generateSecureId();

			expect(id1).not.toBe(id2);
		});

		it('should only contain alphanumeric characters', () => {
			const id = generateSecureId();
			expect(id).toMatch(/^[A-Za-z0-9]+$/);
		});
	});

	describe('RateLimiter', () => {
		let limiter: RateLimiter;

		beforeEach(() => {
			limiter = new RateLimiter(3, 1000); // 3 calls per second
		});

		it('should allow calls under the limit', () => {
			expect(limiter.canProceed('user1')).toBe(true);
			expect(limiter.canProceed('user1')).toBe(true);
			expect(limiter.canProceed('user1')).toBe(true);
		});

		it('should block calls over the limit', () => {
			limiter.canProceed('user1');
			limiter.canProceed('user1');
			limiter.canProceed('user1');
			expect(limiter.canProceed('user1')).toBe(false);
		});

		it('should track different keys separately', () => {
			limiter.canProceed('user1');
			limiter.canProceed('user1');
			limiter.canProceed('user1');

			expect(limiter.canProceed('user2')).toBe(true);
		});

		it('should reset rate limit for a key', () => {
			limiter.canProceed('user1');
			limiter.canProceed('user1');
			limiter.canProceed('user1');
			expect(limiter.canProceed('user1')).toBe(false);

			limiter.reset('user1');
			expect(limiter.canProceed('user1')).toBe(true);
		});
	});
});
