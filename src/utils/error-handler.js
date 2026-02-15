/**
 * Error Handling Utilities for draw.io Desktop
 * Provides centralized error handling, custom error classes, and error boundaries
 */
import { logger } from './logger.js';
import { dialog, BrowserWindow } from 'electron';

const log = logger.child('ErrorHandler');

// Custom error classes
export class AppError extends Error {
	public code: string;
	public userMessage: string;
	public shouldReport: boolean;

	constructor(
		message: string,
		code: string = 'UNKNOWN_ERROR',
		userMessage?: string,
		shouldReport: boolean = true
	) {
		super(message);
		this.name = 'AppError';
		this.code = code;
		this.userMessage = userMessage || message;
		this.shouldReport = shouldReport;
		Error.captureStackTrace(this, this.constructor);
	}
}

export class FileError extends AppError {
	public filePath?: string;

	constructor(
		message: string,
		code: string,
		filePath?: string,
		userMessage?: string
	) {
		super(message, code, userMessage || `File error: ${message}`);
		this.name = 'FileError';
		this.filePath = filePath;
	}
}

export class SecurityError extends AppError {
	constructor(message: string, code: string = 'SECURITY_VIOLATION') {
		super(message, code, 'A security error occurred. Please try again.', true);
		this.name = 'SecurityError';
	}
}

export class ValidationError extends AppError {
	public field?: string;

	constructor(message: string, field?: string) {
		super(message, 'VALIDATION_ERROR', `Invalid input: ${message}`, false);
		this.name = 'ValidationError';
		this.field = field;
	}
}

export class ExportError extends AppError {
	public format?: string;

	constructor(message: string, format?: string) {
		super(message, 'EXPORT_ERROR', `Export failed: ${message}`);
		this.name = 'ExportError';
		this.format = format;
	}
}

// Error codes map for user-friendly messages
const ERROR_MESSAGES: Record<string, string> = {
	FILE_NOT_FOUND: 'The requested file could not be found.',
	FILE_ACCESS_DENIED: 'Access to the file was denied.',
	FILE_TOO_LARGE: 'The file is too large to process.',
	FILE_INVALID: 'The file format is invalid or corrupted.',
	FILE_CONFLICT: 'The file has been modified by another program.',
	PATH_TRAVERSAL: 'Invalid file path detected.',
	SECURITY_VIOLATION: 'A security error occurred.',
	EXPORT_FAILED: 'Failed to export the diagram.',
	NETWORK_ERROR: 'A network error occurred.',
	TIMEOUT: 'The operation timed out.',
	UNKNOWN_ERROR: 'An unexpected error occurred.',
};

/**
 * Get user-friendly error message
 */
export function getUserFriendlyError(error: Error | AppError): string {
	if (error instanceof AppError) {
		return error.userMessage;
	}

	// Check if it's a standard error with known code
	const code = (error as any).code;
	if (code && ERROR_MESSAGES[code]) {
		return ERROR_MESSAGES[code];
	}

	return ERROR_MESSAGES.UNKNOWN_ERROR;
}

/**
 * Show error dialog to user
 */
export function showErrorDialog(
	title: string,
	message: string,
	details?: string,
	buttons?: string[]
): Promise<number> {
	return new Promise((resolve) => {
		const focusedWindow = BrowserWindow.getFocusedWindow();

		dialog.showMessageBox(focusedWindow || undefined, {
			type: 'error',
			title,
			message,
			detail: details,
			buttons: buttons || ['OK'],
			defaultId: 0,
		}).then((result) => {
			resolve(result.response);
		}).catch((err) => {
			log.error('Failed to show error dialog', 'ErrorDialog', { error: err });
			resolve(0);
		});
	});
}

/**
 * Handle async errors with proper logging and user feedback
 */
export async function handleAsyncError<T>(
	operation: () => Promise<T>,
	context: string,
	options: {
		silent?: boolean;
		retry?: number;
		onError?: (error: Error) => void;
	} = {}
): Promise<T | null> {
	const { silent = false, retry = 0, onError } = options;
	let lastError: Error | null = null;

	for (let attempt = 0; attempt <= retry; attempt++) {
		try {
			return await operation();
		} catch (error) {
			lastError = error as Error;

			if (attempt < retry) {
				log.warn(`Operation failed, retrying (${attempt + 1}/${retry})`, context, {
					error: lastError.message
				});
				// Exponential backoff
				await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
			}
		}
	}

	// All retries exhausted
	if (lastError) {
		log.exception(lastError, context);

		if (onError) {
			onError(lastError);
		}

		if (!silent) {
			const userMessage = getUserFriendlyError(lastError);
			await showErrorDialog('Error', userMessage, lastError.message);
		}
	}

	return null;
}

/**
 * Global unhandled rejection handler
 */
export function setupGlobalErrorHandlers(): void {
	// Handle unhandled promise rejections
	process.on('unhandledRejection', (reason, promise) => {
		log.error('Unhandled Promise Rejection', 'Global', {
			reason: reason instanceof Error ? reason.message : reason,
			stack: reason instanceof Error ? reason.stack : undefined
		});

		// Attempt graceful recovery
		if (reason instanceof AppError && reason.shouldReport) {
			showErrorDialog(
				'Application Error',
				'An unexpected error occurred.',
				reason.message
			);
		}
	});

	// Handle uncaught exceptions
	process.on('uncaughtException', (error) => {
		log.exception(error, 'Global');

		// Show error dialog and attempt graceful shutdown
		showErrorDialog(
			'Critical Error',
			'A critical error occurred. The application will now close.',
			error.message
		).finally(() => {
			process.exit(1);
		});
	});

	// Handle Electron renderer crashes
	if (process.type === 'browser') {
		const { app } = require('electron');
		app.on('render-process-gone', (event, webContents, details) => {
			log.error('Renderer process crashed', 'Global', {
				reason: details.reason,
				exitCode: details.exitCode
			});
		});
	}
}

/**
 * Wrap IPC handlers with error handling
 */
export function wrapIPCHandler<T extends (...args: any[]) => any>(
	handler: T,
	context: string
): (...args: Parameters<T>) => Promise<ReturnType<T> | { error: true; message: string }> {
	return async (...args: Parameters<T>): Promise<ReturnType<T> | { error: true; message: string }> => {
		try {
			return await handler(...args);
		} catch (error) {
			log.exception(error as Error, `IPC:${context}`);

			if (error instanceof AppError) {
				return {
					error: true,
					message: error.userMessage
				};
			}

			return {
				error: true,
				message: getUserFriendlyError(error as Error)
			};
		}
	};
}

/**
 * Create a safe async function wrapper
 */
export function safeAsync<T extends (...args: any[]) => Promise<any>>(
	fn: T,
	context: string
): (...args: Parameters<T>) => Promise<ReturnType<T> | null> {
	return async (...args: Parameters<T>): Promise<ReturnType<T> | null> => {
		try {
			return await fn(...args);
		} catch (error) {
			log.exception(error as Error, context);
			return null;
		}
	};
}

// Export error codes for use throughout the app
export const ErrorCodes = {
	FILE_NOT_FOUND: 'FILE_NOT_FOUND',
	FILE_ACCESS_DENIED: 'FILE_ACCESS_DENIED',
	FILE_TOO_LARGE: 'FILE_TOO_LARGE',
	FILE_INVALID: 'FILE_INVALID',
	FILE_CONFLICT: 'FILE_CONFLICT',
	PATH_TRAVERSAL: 'PATH_TRAVERSAL',
	SECURITY_VIOLATION: 'SECURITY_VIOLATION',
	EXPORT_FAILED: 'EXPORT_FAILED',
	NETWORK_ERROR: 'NETWORK_ERROR',
	TIMEOUT: 'TIMEOUT',
	UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;
