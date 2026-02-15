/**
 * Security Utilities for draw.io Desktop
 * Provides secure file path validation, content validation, and security helpers
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const log = logger.child('Security');

// Security configuration
const SECURITY_CONFIG = {
	MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB max file size
	MAX_PATH_LENGTH: 4096, // Maximum path length
	ALLOWED_EXTENSIONS: ['.drawio', '.vsdx', '.png', '.jpg', '.jpeg', '.svg', '.xml', '.pdf', '.csv', '.dtmp', '.bkp'],
	SUSPICIOUS_PATTERNS: [
		/\.\./, // Directory traversal
		/<script/i, // Script injection
		/javascript:/i, // JavaScript protocol
		/data:text\/html/i, // Data URI
	],
};

// Get application base directory for path validation
function getAppBaseDir(): string {
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = path.dirname(__filename);
	return path.join(__dirname, __dirname.endsWith(path.join('resources', 'app.asar', 'src', 'utils'))
		? '/../../../../'
		: '/../../');
}

// Normalize and validate path characters
function normalizePath(inputPath: string): string {
	// Remove null bytes and control characters
	let normalized = inputPath.replace(/[\x00-\x1f\x7f]/g, '');

	// Normalize path separators
	normalized = path.normalize(normalized);

	return normalized;
}

/**
 * Validates if a file path is within allowed directories
 * Prevents path traversal attacks and access to sensitive locations
 */
export function isValidPath(filePath: string, allowedPrefixes: string[]): boolean {
	try {
		// Check path length
		if (filePath.length > SECURITY_CONFIG.MAX_PATH_LENGTH) {
			log.warn('Path exceeds maximum length', 'PathValidation', { path: filePath.substring(0, 100) });
			return false;
		}

		// Normalize the path
		const normalized = normalizePath(filePath);
		const resolved = path.resolve(normalized);

		// Check for suspicious patterns
		for (const pattern of SECURITY_CONFIG.SUSPICIOUS_PATTERNS) {
			if (pattern.test(resolved)) {
				log.warn('Suspicious path pattern detected', 'PathValidation', { path: filePath });
				return false;
			}
		}

		// Check if path starts with any allowed prefix
		for (const prefix of allowedPrefixes) {
			const resolvedPrefix = path.resolve(prefix);
			if (resolved.startsWith(resolvedPrefix)) {
				return true;
			}
		}

		log.warn('Path outside allowed directories', 'PathValidation', { path: filePath });
		return false;
	} catch (error) {
		log.exception(error as Error, 'PathValidation');
		return false;
	}
}

/**
 * Validates that a path is not within the application directory
 */
export function isOutsideAppDir(filePath: string): boolean {
	const appBaseDir = getAppBaseDir();
	const resolved = path.resolve(normalizePath(filePath));
	const resolvedAppBase = path.resolve(appBaseDir);

	return !resolved.startsWith(resolvedAppBase);
}

/**
 * Validates file size before operations
 */
export function validateFileSize(filePath: string, maxSize: number = SECURITY_CONFIG.MAX_FILE_SIZE): boolean {
	try {
		if (!fs.existsSync(filePath)) {
			return true; // New file
		}

		const stats = fs.statSync(filePath);
		if (stats.size > maxSize) {
			log.warn('File exceeds maximum size', 'FileValidation', {
				path: filePath,
				size: stats.size,
				maxSize
			});
			return false;
		}
		return true;
	} catch (error) {
		log.exception(error as Error, 'FileValidation');
		return false;
	}
}

/**
 * Validates file extension against allowed list
 */
export function isAllowedExtension(filePath: string, customExtensions?: string[]): boolean {
	const extensions = customExtensions || SECURITY_CONFIG.ALLOWED_EXTENSIONS;
	const ext = path.extname(filePath).toLowerCase();
	return extensions.includes(ext);
}

/**
 * Secure file deletion with content validation
 */
export async function secureDelete(filePath: string): Promise<boolean> {
	try {
		// Verify file exists and is a regular file
		const stats = await fs.promises.stat(filePath);
		if (!stats.isFile()) {
			log.warn('Not a file, cannot delete', 'SecureDelete', { path: filePath });
			return false;
		}

		// Check file is outside app directory
		if (!isOutsideAppDir(filePath)) {
			log.error('Cannot delete files within app directory', 'SecureDelete', { path: filePath });
			return false;
		}

		await fs.promises.unlink(filePath);
		log.info('File securely deleted', 'SecureDelete', { path: filePath });
		return true;
	} catch (error) {
		log.exception(error as Error, 'SecureDelete');
		return false;
	}
}

/**
 * Sanitizes filename to prevent injection attacks
 */
export function sanitizeFilename(filename: string): string {
	// Remove path separators and dangerous characters
	let sanitized = filename
		.replace(/[/\\]/g, '')
		.replace(/[<>:"|?*]/g, '')
		.replace(/\s+/g, ' ')
		.trim();

	// Limit length
	if (sanitized.length > 255) {
		sanitized = sanitized.substring(0, 255);
	}

	// Ensure filename is not empty or just dots
	if (!sanitized || /^\.*$/.test(sanitized)) {
		sanitized = 'unnamed';
	}

	return sanitized;
}

/**
 * Validates file content for security
 * Checks for suspicious patterns and size limits
 */
export function validateFileContent(content: string | Buffer, encoding?: string): boolean {
	try {
		// Check content size
		const size = Buffer.isBuffer(content) ? content.length : Buffer.byteLength(content, encoding as BufferEncoding);
		if (size > SECURITY_CONFIG.MAX_FILE_SIZE) {
			log.warn('Content exceeds maximum size', 'ContentValidation', { size });
			return false;
		}

		// Check for suspicious patterns in text content
		if (typeof content === 'string') {
			for (const pattern of SECURITY_CONFIG.SUSPICIOUS_PATTERNS) {
				if (pattern.test(content)) {
					log.warn('Suspicious content pattern detected', 'ContentValidation');
					return false;
				}
			}
		}

		return true;
	} catch (error) {
		log.exception(error as Error, 'ContentValidation');
		return false;
	}
}

/**
 * Rate limiter for IPC calls
 */
export class RateLimiter {
	private calls: Map<string, number[]> = new Map();
	private maxCalls: number;
	private windowMs: number;

	constructor(maxCalls: number = 100, windowMs: number = 60000) {
		this.maxCalls = maxCalls;
		this.windowMs = windowMs;
	}

	canProceed(key: string): boolean {
		const now = Date.now();
		const calls = this.calls.get(key) || [];

		// Remove old calls outside window
		const recentCalls = calls.filter(timestamp => now - timestamp < this.windowMs);

		if (recentCalls.length >= this.maxCalls) {
			log.warn('Rate limit exceeded', 'RateLimiter', { key, calls: recentCalls.length });
			return false;
		}

		recentCalls.push(now);
		this.calls.set(key, recentCalls);
		return true;
	}

	reset(key: string): void {
		this.calls.delete(key);
	}
}

/**
 * Secure random ID generator
 */
export function generateSecureId(length: number = 16): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let result = '';
	const randomValues = new Uint8Array(length);

	// Use crypto.getRandomValues if available, fallback to Math.random
	if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
		crypto.getRandomValues(randomValues);
		for (let i = 0; i < length; i++) {
			result += chars[randomValues[i] % chars.length];
		}
	} else {
		for (let i = 0; i < length; i++) {
			result += chars[Math.floor(Math.random() * chars.length)];
		}
	}

	return result;
}

// Export configuration for external use
export { SECURITY_CONFIG };
