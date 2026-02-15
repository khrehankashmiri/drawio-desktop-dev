/**
 * Clipboard Service for draw.io Desktop
 * Handles clipboard operations securely
 */
import { clipboard, nativeImage } from 'electron';
import { logger } from '../utils/logger.js';

const log = logger.child('ClipboardService');

interface ImageData {
	dataUrl: string;
	w: number;
	h: number;
}

/**
 * Write text to clipboard
 */
export function writeText(text: string): void {
	try {
		clipboard.writeText(text);
		log.debug('Text written to clipboard', 'ClipboardService');
	} catch (error) {
		log.error('Failed to write text to clipboard', 'ClipboardService', {
			error: (error as Error).message
		});
		throw error;
	}
}

/**
 * Read text from clipboard
 */
export function readText(): string {
	try {
		const text = clipboard.readText();
		log.debug('Text read from clipboard', 'ClipboardService');
		return text;
	} catch (error) {
		log.error('Failed to read text from clipboard', 'ClipboardService', {
			error: (error as Error).message
		});
		return '';
	}
}

/**
 * Write image to clipboard
 */
export function writeImage(data: ImageData): void {
	try {
		const image = nativeImage.createFromDataURL(data.dataUrl);

		clipboard.write({
			image,
			html: `<img src="${data.dataUrl}" width="${data.w}" height="${data.h}">`
		});

		log.debug('Image written to clipboard', 'ClipboardService', {
			width: data.w,
			height: data.h
		});
	} catch (error) {
		log.error('Failed to write image to clipboard', 'ClipboardService', {
			error: (error as Error).message
		});
		throw error;
	}
}

/**
 * Read image from clipboard
 */
export function readImage(): Electron.NativeImage | null {
	try {
		const image = clipboard.readImage();

		if (image.isEmpty()) {
			return null;
		}

		log.debug('Image read from clipboard', 'ClipboardService', {
			size: image.getSize()
		});

		return image;
	} catch (error) {
		log.error('Failed to read image from clipboard', 'ClipboardService', {
			error: (error as Error).message
		});
		return null;
	}
}

/**
 * Clear clipboard
 */
export function clear(): void {
	try {
		clipboard.clear();
		log.debug('Clipboard cleared', 'ClipboardService');
	} catch (error) {
		log.error('Failed to clear clipboard', 'ClipboardService', {
			error: (error as Error).message
		});
	}
}

/**
 * Check if clipboard has text
 */
export function hasText(): boolean {
	return clipboard.availableFormats().includes('text/plain');
}

/**
 * Check if clipboard has image
 */
export function hasImage(): boolean {
	return clipboard.availableFormats().includes('image/png') ||
		   clipboard.availableFormats().includes('image/jpeg');
}

/**
 * Get available formats
 */
export function getAvailableFormats(): string[] {
	return clipboard.availableFormats();
}
