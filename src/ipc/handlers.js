/**
 * IPC Handlers for draw.io Desktop
 * Centralized IPC communication handlers
 */
import { ipcMain, dialog, BrowserWindow, app, shell } from 'electron';
import fs from 'fs';
import { logger } from '../utils/logger.js';
import { RateLimiter, isOutsideAppDir, validateFileContent } from '../utils/security.js';
import { wrapIPCHandler, FileError, ErrorCodes } from '../utils/error-handler.js';
import * as FileService from '../services/FileService.js';
import * as WindowManager from '../services/WindowManager.js';
import * as PluginService from '../services/PluginService.js';
import * as ClipboardService from '../services/ClipboardService.js';
import { exportDiagram } from '../services/ExportService.js';

const log = logger.child('IPCHandlers');

// Rate limiter for IPC calls
const rateLimiter = new RateLimiter(100, 60000);

// Dialog state
let dialogOpen = false;

// Configuration (passed from main)
interface IPCConfig {
	codeDir: string;
	__dirname: string;
	store: any;
	enableSpellCheck: boolean;
	appZoom: number;
	__DEV__: boolean;
	codeUrl: string;
	validateSender: (frame: any) => boolean;
}

let config: IPCConfig;

/**
 * Initialize IPC handlers
 */
export function initializeIPC(ipcConfig: IPCConfig): void {
	config = ipcConfig;

	// Clean up existing handlers
	ipcMain.removeAllListeners('rendererReq');
	ipcMain.removeAllListeners('newfile');
	ipcMain.removeAllListeners('openDevTools');
	ipcMain.removeAllListeners('toggleSpellCheck');
	ipcMain.removeAllListeners('toggleStoreBkp');
	ipcMain.removeAllListeners('toggleGoogleFonts');
	ipcMain.removeAllListeners('toggleFullscreen');
	ipcMain.removeAllListeners('checkForUpdates');
	ipcMain.removeAllListeners('zoomIn');
	ipcMain.removeAllListeners('zoomOut');
	ipcMain.removeAllListeners('resetZoom');
	ipcMain.removeAllListeners('export');

	// Set up handlers
	setupRendererRequestHandler();
	setupSimpleHandlers();
	setupExportHandler();

	log.info('IPC handlers initialized', 'IPCHandlers');
}

/**
 * Set up main renderer request handler
 */
function setupRendererRequestHandler(): void {
	ipcMain.on('rendererReq', async (event, args) => {
		// Validate sender
		if (!config.validateSender(event.senderFrame)) {
			log.warn('Invalid sender for IPC request', 'IPCHandlers', {
				action: args.action
			});
			event.reply('mainResp', {
				error: true,
				msg: 'Invalid sender',
				reqId: args.reqId
			});
			return;
		}

		// Rate limiting
		const clientId = event.senderFrame?.url || 'unknown';
		if (!rateLimiter.canProceed(clientId)) {
			event.reply('mainResp', {
				error: true,
				msg: 'Rate limit exceeded',
				reqId: args.reqId
			});
			return;
		}

		try {
			const result = await handleAction(args);
			event.reply('mainResp', {
				success: true,
				data: result,
				reqId: args.reqId
			});
		} catch (error) {
			log.error('IPC action failed', 'IPCHandlers', {
				action: args.action,
				error: (error as Error).message
			});

			event.reply('mainResp', {
				error: true,
				msg: (error as Error).message,
				e: error,
				reqId: args.reqId
			});
		}
	});
}

/**
 * Handle individual actions
 */
async function handleAction(args: any): Promise<any> {
	const appDataFolder = FileService.getAppDataFolder();

	switch (args.action) {
		case 'saveFile':
			return await FileService.saveFile(
				args.fileObject,
				args.data,
				args.origStat,
				args.overwrite,
				args.defEnc,
				args.enableStoreBkp ?? true
			);

		case 'writeFile':
			await FileService.writeFile(args.path, args.data, args.enc);
			return null;

		case 'saveDraft':
			return await FileService.saveDraft(args.fileObject, args.data);

		case 'getFileDrafts':
			return await FileService.getFileDrafts(args.fileObject);

		case 'getDocumentsFolder':
			return FileService.getDocumentsFolder();

		case 'checkFileExists':
			return FileService.checkFileExists(args.pathParts);

		case 'showOpenDialog':
			dialogOpen = true;
			try {
				const openResult = await dialog.showOpenDialog(
					BrowserWindow.getFocusedWindow()!,
					{
						defaultPath: args.defaultPath,
						filters: args.filters,
						properties: args.properties
					}
				);
				return openResult.filePaths;
			} finally {
				dialogOpen = false;
			}

		case 'showSaveDialog':
			dialogOpen = true;
			try {
				const saveResult = await dialog.showSaveDialog(
					BrowserWindow.getFocusedWindow()!,
					{
						defaultPath: args.defaultPath,
						filters: args.filters
					}
				);
				return saveResult.canceled ? null : saveResult.filePath;
			} finally {
				dialogOpen = false;
			}

		case 'installPlugin':
			return await PluginService.installPlugin(args.filePath, appDataFolder);

		case 'uninstallPlugin':
			PluginService.uninstallPlugin(args.plugin, appDataFolder);
			return null;

		case 'getPluginFile':
			return PluginService.getPluginFile(args.plugin, appDataFolder);

		case 'isPluginsEnabled':
			return PluginService.isPluginsEnabled();

		case 'dirname':
			return FileService.dirname(args.path);

		case 'readFile':
			return await FileService.readFile(args.filename, args.encoding);

		case 'clipboardAction':
			handleClipboardAction(args.method, args.data);
			return null;

		case 'deleteFile':
			await FileService.deleteFile(args.file);
			return null;

		case 'fileStat':
			return await FileService.fileStat(args.file);

		case 'isFileWritable':
			return await FileService.isFileWritable(args.file);

		case 'windowAction':
			return handleWindowAction(args.method);

		case 'openExternal':
			return openExternal(args.url);

		case 'watchFile':
			return watchFile(args.path);

		case 'unwatchFile':
			unwatchFile(args.path);
			return null;

		case 'exit':
			app.quit();
			return null;

		case 'isFullscreen':
			return WindowManager.isFullScreen();

		default:
			throw new Error(`Unknown action: ${args.action}`);
	}
}

/**
 * Handle clipboard actions
 */
function handleClipboardAction(method: string, data: any): void {
	switch (method) {
		case 'writeText':
			ClipboardService.writeText(data);
			break;
		case 'readText':
			return ClipboardService.readText();
		case 'writeImage':
			ClipboardService.writeImage(data);
			break;
		default:
			log.warn('Unknown clipboard action', 'IPCHandlers', { method });
	}
}

/**
 * Handle window actions
 */
function handleWindowAction(method: string): any {
	switch (method) {
		case 'minimize':
			WindowManager.minimizeWindow();
			break;
		case 'maximize':
			WindowManager.maximizeWindow();
			break;
		case 'unmaximize':
			WindowManager.unmaximizeWindow();
			break;
		case 'close':
			WindowManager.closeWindow();
			break;
		case 'isMaximized':
			return WindowManager.isMaximized();
		case 'removeAllListeners':
			WindowManager.removeAllListeners();
			break;
		default:
			log.warn('Unknown window action', 'IPCHandlers', { method });
	}
	return null;
}

/**
 * Open external URL securely
 */
function openExternal(url: string): boolean {
	const allowedUrls = /^(?:https?|mailto|tel|callto):/i;

	if (allowedUrls.test(url)) {
		shell.openExternal(url);
		return true;
	}

	log.warn('Blocked external URL', 'IPCHandlers', { url });
	return false;
}

/**
 * Watch file for changes
 */
function watchFile(filePath: string): void {
	const win = BrowserWindow.getFocusedWindow();
	if (!win) return;

	fs.watchFile(filePath, (curr, prev) => {
		try {
			win.webContents.send('fileChanged', {
				path: filePath,
				curr,
				prev
			});
		} catch (e) {
			// Window may be closed
		}
	});
}

/**
 * Stop watching file
 */
function unwatchFile(filePath: string): void {
	fs.unwatchFile(filePath);
}

/**
 * Set up simple event handlers
 */
function setupSimpleHandlers(): void {
	// New file
	ipcMain.on('newfile', (e, arg) => {
		if (!config.validateSender(e.senderFrame)) return;

		// Import createWindow from main (passed via context or require)
		// This will be handled by the main process
		e.sender.send('request-new-window', arg);
	});

	// DevTools
	ipcMain.on('openDevTools', function(e) {
		if (!config.validateSender(e.senderFrame)) return;
		const win = BrowserWindow.getFocusedWindow();
		if (win) win.webContents.openDevTools();
	});

	// Toggles
	ipcMain.on('toggleSpellCheck', (e) => {
		if (!config.validateSender(e.senderFrame)) return;
		if (config.store != null) {
			const current = config.store.get('enableSpellCheck') ?? process.platform === 'darwin';
			config.store.set('enableSpellCheck', !current);
		}
	});

	ipcMain.on('toggleStoreBkp', (e) => {
		if (!config.validateSender(e.senderFrame)) return;
		if (config.store != null) {
			const current = config.store.get('enableStoreBkp') ?? true;
			config.store.set('enableStoreBkp', !current);
		}
	});

	ipcMain.on('toggleGoogleFonts', (e) => {
		if (!config.validateSender(e.senderFrame)) return;
		if (config.store != null) {
			const current = config.store.get('isGoogleFontsEnabled') ?? false;
			config.store.set('isGoogleFontsEnabled', !current);
		}
	});

	ipcMain.on('toggleFullscreen', (e) => {
		if (!config.validateSender(e.senderFrame)) return;
		WindowManager.toggleFullScreen();
	});

	// Zoom
	ipcMain.on('zoomIn', () => WindowManager.zoomIn());
	ipcMain.on('zoomOut', () => WindowManager.zoomOut());
	ipcMain.on('resetZoom', () => WindowManager.resetZoom());
}

/**
 * Set up export handler
 */
function setupExportHandler(): void {
	ipcMain.on('export', (event, args) => {
		if (!config.validateSender(event.senderFrame)) return;

		exportDiagram(
			event,
			args,
			config.codeDir,
			config.__dirname,
			WindowManager.getFirstWindow(),
			false,
			config.__DEV__
		);
	});
}

/**
 * Check if dialog is open
 */
export function isDialogOpen(): boolean {
	return dialogOpen;
}
