/**
 * Structured Logging Utility for draw.io Desktop
 * Provides consistent logging across the application with security considerations
 */
import log from 'electron-log';
import { app } from 'electron';
import path from 'path';

// Log levels
export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'verbose';

// Log entry structure
interface LogEntry {
	timestamp: string;
	level: LogLevel;
	message: string;
	context?: string;
	data?: any;
	traceId?: string;
}

// Sanitize sensitive data from logs
function sanitizeData(data: any): any {
	if (typeof data !== 'object' || data === null) {
		return data;
	}

	const sensitiveKeys = [
		'password', 'token', 'secret', 'key', 'auth',
		'credential', 'private', 'certificate', 'passphrase'
	];

	const sanitized = Array.isArray(data) ? [...data] : { ...data };

	for (const key of Object.keys(sanitized)) {
		if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
			sanitized[key] = '[REDACTED]';
		} else if (typeof sanitized[key] === 'object') {
			sanitized[key] = sanitizeData(sanitized[key]);
		}
	}

	return sanitized;
}

// Generate trace ID for request tracking
function generateTraceId(): string {
	return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

class Logger {
	private static instance: Logger;
	private isDev: boolean;

	private constructor() {
		this.isDev = process.env.DRAWIO_ENV === 'dev';
		this.configureLogger();
	}

	static getInstance(): Logger {
		if (!Logger.instance) {
			Logger.instance = new Logger();
		}
		return Logger.instance;
	}

	private configureLogger(): void {
		// Configure electron-log
		log.transports.file.level = 'info';
		log.transports.console.level = this.isDev ? 'debug' : 'error';

		// Set log file location
		if (app && app.getPath) {
			const logPath = app.getPath('userData');
			log.transports.file.resolvePath = () =>
				path.join(logPath, 'logs', 'main.log');
		}

		// Format log entries
		log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
		log.transports.console.format = '{level} | {text}';
	}

	private createLogEntry(
		level: LogLevel,
		message: string,
		context?: string,
		data?: any,
		traceId?: string
	): LogEntry {
		return {
			timestamp: new Date().toISOString(),
			level,
			message,
			context,
			data: data ? sanitizeData(data) : undefined,
			traceId: traceId || generateTraceId()
		};
	}

	private log(level: LogLevel, message: string, context?: string, data?: any, traceId?: string): void {
		const entry = this.createLogEntry(level, message, context, data, traceId);

		// Log to electron-log
		const logMessage = context
			? `[${context}] ${message}`
			: message;

		switch (level) {
			case 'error':
				log.error(logMessage, data || '');
				break;
			case 'warn':
				log.warn(logMessage, data || '');
				break;
			case 'info':
				log.info(logMessage, data || '');
				break;
			case 'debug':
				log.debug(logMessage, data || '');
				break;
			case 'verbose':
				log.verbose(logMessage, data || '');
				break;
		}

		// In dev mode, also log structured data
		if (this.isDev && data) {
			console.log(`[${entry.traceId}]`, JSON.stringify(entry, null, 2));
		}
	}

	// Public logging methods
	error(message: string, context?: string, data?: any, traceId?: string): void {
		this.log('error', message, context, data, traceId);
	}

	warn(message: string, context?: string, data?: any, traceId?: string): void {
		this.log('warn', message, context, data, traceId);
	}

	info(message: string, context?: string, data?: any, traceId?: string): void {
		this.log('info', message, context, data, traceId);
	}

	debug(message: string, context?: string, data?: any, traceId?: string): void {
		this.log('debug', message, context, data, traceId);
	}

	verbose(message: string, context?: string, data?: any, traceId?: string): void {
		this.log('verbose', message, context, data, traceId);
	}

	// Create a child logger with fixed context
	child(context: string): Logger {
		const childLogger = Object.create(this);
		childLogger.log = (level: LogLevel, message: string, ctx?: string, data?: any, traceId?: string) => {
			return this.log(level, message, ctx || context, data, traceId);
		};
		return childLogger;
	}

	// Log exceptions with stack traces
	exception(error: Error, context?: string, traceId?: string): void {
		this.error(error.message, context, {
			stack: error.stack,
			name: error.name,
			code: (error as any).code
		}, traceId);
	}

	// Performance logging
	startTimer(label: string, context?: string): () => void {
		const start = process.hrtime.bigint();
		this.debug(`Timer started: ${label}`, context);

		return () => {
			const end = process.hrtime.bigint();
			const duration = Number(end - start) / 1000000; // Convert to milliseconds
			this.debug(`Timer ended: ${label} (${duration.toFixed(2)}ms)`, context);
		};
	}
}

// Export singleton instance
export const logger = Logger.getInstance();

// Export class for testing
export { Logger };

// Convenience functions for direct import
export const logError = (message: string, context?: string, data?: any) =>
	logger.error(message, context, data);
export const logWarn = (message: string, context?: string, data?: any) =>
	logger.warn(message, context, data);
export const logInfo = (message: string, context?: string, data?: any) =>
	logger.info(message, context, data);
export const logDebug = (message: string, context?: string, data?: any) =>
	logger.debug(message, context, data);
