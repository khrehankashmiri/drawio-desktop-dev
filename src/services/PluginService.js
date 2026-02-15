/**
 * Plugin Service for draw.io Desktop
 * Handles plugin installation, management, and security
 */
import fs from 'fs';
import { promises as fsProm } from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';
import { SecurityError, ErrorCodes } from '../utils/error-handler.js';
import { isOutsideAppDir, sanitizeFilename, isValidPath } from '../utils/security.js';

const log = logger.child('PluginService');

// Plugin state
let pluginsEnabled = false;

/**
 * Enable or disable plugins
 */
export function setPluginsEnabled(enabled: boolean): void {
	pluginsEnabled = enabled;
	log.info(`Plugins ${enabled ? 'enabled' : 'disabled'}`, 'PluginService');
}

/**
 * Check if plugins are enabled
 */
export function isPluginsEnabled(): boolean {
	return pluginsEnabled;
}

/**
 * Get plugins directory
 */
function getPluginsDir(appDataFolder: string): string {
	return path.join(appDataFolder, 'plugins');
}

/**
 * Ensure plugins directory exists
 */
async function ensurePluginsDir(appDataFolder: string): Promise<string> {
	const pluginsDir = getPluginsDir(appDataFolder);

	if (!fs.existsSync(pluginsDir)) {
		await fsProm.mkdir(pluginsDir, { recursive: true });
		log.info('Created plugins directory', 'PluginService', { path: pluginsDir });
	}

	return pluginsDir;
}

/**
 * Install a plugin from file path
 */
export async function installPlugin(
	filePath: string,
	appDataFolder: string
): Promise<{ pluginName: string; selDir: string }> {
	if (!pluginsEnabled) {
		throw new SecurityError('Plugins are disabled', ErrorCodes.SECURITY_VIOLATION);
	}

	// Validate source file exists and is outside app dir
	if (!fs.existsSync(filePath)) {
		throw new SecurityError('Plugin file not found', ErrorCodes.FILE_NOT_FOUND);
	}

	if (!isOutsideAppDir(filePath)) {
		throw new SecurityError('Cannot install from application directory', ErrorCodes.SECURITY_VIOLATION);
	}

	const pluginsDir = await ensurePluginsDir(appDataFolder);

	// Sanitize plugin name
	const originalName = path.basename(filePath);
	const pluginName = sanitizeFilename(originalName);
	const dstFile = path.join(pluginsDir, pluginName);

	// Check if already exists
	if (fs.existsSync(dstFile)) {
		throw new SecurityError('Plugin already exists', 'PLUGIN_EXISTS');
	}

	// Validate destination is within plugins dir
	if (!dstFile.startsWith(pluginsDir)) {
		throw new SecurityError('Invalid plugin destination', ErrorCodes.SECURITY_VIOLATION);
	}

	// Copy plugin file
	try {
		await fsProm.copyFile(filePath, dstFile);
		log.info('Plugin installed', 'PluginService', {
			name: pluginName,
			from: filePath,
			to: dstFile
		});
	} catch (error) {
		log.error('Failed to install plugin', 'PluginService', {
			error: (error as Error).message,
			file: filePath
		});
		throw new SecurityError('Failed to install plugin', 'INSTALL_FAILED');
	}

	return {
		pluginName,
		selDir: path.dirname(filePath)
	};
}

/**
 * Get plugin file path
 */
export function getPluginFile(plugin: string, appDataFolder: string): string | null {
	if (!pluginsEnabled) {
		return null;
	}

	const pluginsDir = getPluginsDir(appDataFolder);
	const pluginFile = path.join(pluginsDir, sanitizeFilename(plugin));

	// Validate the resolved path is within plugins directory
	if (!pluginFile.startsWith(pluginsDir)) {
		log.warn('Plugin path traversal attempt detected', 'PluginService', { plugin });
		return null;
	}

	if (!fs.existsSync(pluginFile)) {
		return null;
	}

	return pluginFile;
}

/**
 * Uninstall a plugin
 */
export function uninstallPlugin(plugin: string, appDataFolder: string): void {
	const pluginFile = getPluginFile(plugin, appDataFolder);

	if (pluginFile) {
		try {
			fs.unlinkSync(pluginFile);
			log.info('Plugin uninstalled', 'PluginService', { plugin });
		} catch (error) {
			log.error('Failed to uninstall plugin', 'PluginService', {
				error: (error as Error).message,
				plugin
			});
			throw new SecurityError('Failed to uninstall plugin', 'UNINSTALL_FAILED');
		}
	}
}

/**
 * List installed plugins
 */
export function listPlugins(appDataFolder: string): string[] {
	if (!pluginsEnabled) {
		return [];
	}

	const pluginsDir = getPluginsDir(appDataFolder);

	if (!fs.existsSync(pluginsDir)) {
		return [];
	}

	try {
		return fs.readdirSync(pluginsDir).filter(file => {
			const fullPath = path.join(pluginsDir, file);
			return fs.statSync(fullPath).isFile();
		});
	} catch (error) {
		log.error('Failed to list plugins', 'PluginService', {
			error: (error as Error).message
		});
		return [];
	}
}

/**
 * Validate plugin file
 */
export async function validatePlugin(filePath: string): Promise<boolean> {
	try {
		const stats = await fsProm.stat(filePath);
		if (!stats.isFile()) {
			return false;
		}

		// Check file size (max 10MB for plugins)
		if (stats.size > 10 * 1024 * 1024) {
			log.warn('Plugin file too large', 'PluginService', {
				path: filePath,
				size: stats.size
			});
			return false;
		}

		// Read and validate content (basic JavaScript check)
		const content = await fsProm.readFile(filePath, 'utf8');

		// Check for suspicious patterns
		const suspiciousPatterns = [
			/eval\s*\(/,
			/Function\s*\(/,
			/document\.write/,
			/importScripts/,
			/XMLHttpRequest/
		];

		for (const pattern of suspiciousPatterns) {
			if (pattern.test(content)) {
				log.warn('Suspicious pattern in plugin', 'PluginService', {
					path: filePath,
					pattern: pattern.toString()
				});
				// Don't block, just warn - plugins are user-installed
			}
		}

		return true;
	} catch (error) {
		log.error('Failed to validate plugin', 'PluginService', {
			error: (error as Error).message,
			path: filePath
		});
		return false;
	}
}
