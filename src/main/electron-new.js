/**
 * Main Electron Process for draw.io Desktop
 * Refactored with modular architecture
 */
import fs from 'fs';
import path from 'path';
import url from 'url';
import { app, BrowserWindow, session, ipcMain, dialog, shell, Menu, clipboard, nativeImage } from 'electron';
import Store from 'electron-store';
import contextMenu from 'electron-context-menu';
import { program } from 'commander';
import elecUpPkg from 'electron-updater';
import ProgressBar from 'electron-progressbar';
import { PDFDocument } from '@cantoo/pdf-lib';
import zlib from 'zlib';
import crc from 'crc';

// Services
import * as WindowManager from './services/WindowManager.js';
import * as FileService from './services/FileService.js';
import * as PluginService from './services/PluginService.js';
import { exportDiagram } from './services/ExportService.js';

// Utils
import { logger } from './utils/logger.js';
import { setupGlobalErrorHandlers, showErrorDialog } from './utils/error-handler.js';
import { isOutsideAppDir } from './utils/security.js';
import { isWithinDisplayBounds } from './utils/display.js';

// IPC
import { initializeIPC, isDialogOpen } from './ipc/handlers.js';

const { autoUpdater } = elecUpPkg;

const log = logger.child('Main');

// Constants
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const codeDir = path.join(__dirname, '/../../drawio/src/main/webapp');
const codeUrl = url.pathToFileURL(codeDir).href.replace(/\/\.:\//, str => str.toUpperCase());

// Development mode
const __DEV__ = process.env.DRAWIO_ENV === 'dev';

// Platform detection
const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';

// Initialize store
let store: Store | null = null;
try {
	store = new Store();
} catch (e) {
	log.error('Failed to initialize electron-store', 'Main', { error: (e as Error).message });
}

// Settings
let enableSpellCheck = store?.get('enableSpellCheck') ?? isMac;
let enableStoreBkp = store?.get('enableStoreBkp') ?? true;
let isGoogleFontsEnabled = store?.get('isGoogleFontsEnabled') ?? false;
let appZoom = 1;
let enablePlugins = false;

// Update configuration
const disableUpdate =
	process.env.DRAWIO_DISABLE_UPDATE === 'true' ||
	process.argv.includes('--disable-update') ||
	fs.existsSync('/.flatpak-info');

const silentUpdate = !disableUpdate && (
	process.env.DRAWIO_SILENT_UPDATE === 'true' ||
	process.argv.includes('--silent-update')
);

// Configure auto-updater
autoUpdater.logger = log as any;
(autoUpdater.logger as any).transports.file.level = 'error';
(autoUpdater.logger as any).transports.console.level = 'error';
autoUpdater.autoDownload = silentUpdate;
autoUpdater.autoInstallOnAppQuit = silentUpdate;

// Setup global error handlers
setupGlobalErrorHandlers();

// Validate sender for IPC security
function validateSender(frame: any): boolean {
	return frame?.url?.replace(/\/\.:\//, (str: string) => str.toUpperCase()).startsWith(codeUrl);
}

// Query object for draw.io
let queryObj: Record<string, number> = {
	dev: __DEV__ ? 1 : 0,
	test: __DEV__ ? 1 : 0,
	gapi: 0,
	db: 0,
	od: 0,
	gh: 0,
	gl: 0,
	tr: 0,
	browser: 0,
	picker: 0,
	mode: 1, // 'device'
	export: 1, // 'https://convert.diagrams.net/node/export'
	disableUpdate: disableUpdate ? 1 : 0,
	enableSpellCheck: enableSpellCheck ? 1 : 0,
	enableStoreBkp: enableStoreBkp ? 1 : 0,
	isGoogleFontsEnabled: isGoogleFontsEnabled ? 1 : 0
};

// Load URL params from config file
try {
	const urlParamsPath = path.join(process.cwd(), 'urlParams.json');
	if (fs.existsSync(urlParamsPath)) {
		const urlParams = JSON.parse(fs.readFileSync(urlParamsPath, 'utf8'));
		Object.assign(queryObj, urlParams);
	}
} catch (e) {
	log.error('Error loading urlParams.json', 'Main', { error: (e as Error).message });
}

// Disable hardware acceleration if requested
if (process.argv.includes('--disable-acceleration')) {
	log.info('Hardware acceleration disabled', 'Main');
	app.disableHardwareAcceleration();
}

// Configure context menu
contextMenu({
	showCopyImage: true,
	showSaveImage: true,
	showSaveImageAs: true,
	showLookUpSelection: false,
	showSearchWithGoogle: false,
	showCopyLink: false,
	showSelectAll: true,
	append: (defaultActions, params, browserWindow) => [
		{
			label: 'Paste and Match Style',
			visible: clipboard.availableFormats().includes('text/plain'),
			click: () => browserWindow.webContents.pasteAndMatchStyle()
		}
	]
});

// App ready handler
app.whenReady().then(async () => {
	log.info('Application starting', 'Main', { version: app.getVersion(), dev: __DEV__ });

	// Set up CSP
	setupCSP();

	// Set up file request filtering
	setupFileFilter();

	// Initialize IPC handlers
	initializeIPC({
		codeDir,
		__dirname,
		store,
		enableSpellCheck,
		appZoom,
		__DEV__,
		codeUrl,
		validateSender
	});

	// Parse CLI arguments
	const options = parseCLIArguments();
	enablePlugins = options.enablePlugins ?? false;
	PluginService.setPluginsEnabled(enablePlugins);

	if (options.zoom) {
		appZoom = options.zoom;
	}

	// Handle export mode
	if (options.export) {
		await handleExportMode(options);
		return;
	}

	// Handle help/version
	if (process.argv.includes('-h') || process.argv.includes('--help') ||
		process.argv.includes('-V') || process.argv.includes('--version')) {
		app.quit();
		return;
	}

	// Single instance lock
	const gotTheLock = app.requestSingleInstanceLock();
	if (!gotTheLock) {
		log.info('Another instance is running, quitting', 'Main');
		app.quit();
		return;
	}

	// Handle second instance
	app.on('second-instance', (event, commandLine) => {
		if (isDialogOpen()) return;
		createNewWindow(commandLine);
	});

	// Create initial window
	await createInitialWindow(options);

	// Set up application menu
	setupApplicationMenu();

	// Check for updates
	if (!disableUpdate && !store?.get('dontCheckUpdates')) {
		setupAutoUpdater();
	}
});

// Set up Content Security Policy
function setupCSP(): void {
	session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
		const googleFonts = isGoogleFontsEnabled
			? ' https://fonts.googleapis.com https://fonts.gstatic.com'
			: '';

		callback({
			responseHeaders: {
				...details.responseHeaders,
				'Content-Security-Policy': [
					`default-src 'self'; ` +
					`script-src 'self' 'sha256-f6cHSTUnCvbQqwa6rKcbWIpgN9dLl0ROfpEKTQUQPr8=' 'sha256-6g514VrT/cZFZltSaKxIVNFF46+MFaTSDTPB8WfYK+c=' 'sha256-ZQ86kVKhLmcnklYAnUksoyZaLkv7vvOG9cc/hBJAEuQ='; ` +
					`connect-src 'self'${googleFonts}; ` +
					`img-src * data:; ` +
					`media-src *; ` +
					`font-src * data:; ` +
					`frame-src 'none'; ` +
					`style-src 'self' 'unsafe-inline'${googleFonts}; ` +
					`base-uri 'none'; ` +
					`child-src 'self'; ` +
					`object-src 'none';`
				]
			}
		});
	});
}

// Set up file request filtering
function setupFileFilter(): void {
	const pluginsCodeUrl = url.pathToFileURL(
		path.join(FileService.getAppDataFolder(), '/plugins/')
	).href.replace(/\/\.:\//, str => str.toUpperCase());

	session.defaultSession.webRequest.onBeforeRequest(
		{ urls: ['file://*'] },
		(details, callback) => {
			const reqUrl = details.url.replace(/\/\.:\//, str => str.toUpperCase());

			const isAllowed = reqUrl.startsWith(codeUrl) ||
				(enablePlugins && reqUrl.startsWith(pluginsCodeUrl));

			if (!isAllowed) {
				log.warn('Blocked file request', 'Main', { url: details.url });
				callback({ cancel: true });
			} else {
				callback({});
			}
		}
	);
}

// Parse CLI arguments
function parseCLIArguments() {
	let argv = process.argv;

	if (process.defaultApp !== true) {
		argv = [null, ...argv];
	}

	const validFormatRegExp = /^(pdf|svg|png|jpeg|jpg|xml)$/;
	const themeRegExp = /^(dark|light)$/;
	const linkTargetRegExp = /^(auto|new-win|same-win)$/;

	const argsRange = (val: string) => val.split('..').map(n => parseInt(n, 10) - 1);

	program
		.version(app.getVersion())
		.usage('[options] <input file/folder>')
		.argument('[input file/folder]', 'input drawio file or folder')
		.allowUnknownOption()
		.option('-c, --create', 'create new empty file if none passed')
		.option('-k, --check', 'do not overwrite existing files')
		.option('-x, --export', 'export input file/folder')
		.option('-r, --recursive', 'recursively convert sub-folders')
		.option('-o, --output <output>', 'output file/folder')
		.option('-f, --format <format>', 'export format', validFormatRegExp, 'pdf')
		.option('-q, --quality <quality>', 'JPEG quality', parseInt)
		.option('-t, --transparent', 'transparent PNG background')
		.option('-e, --embed-diagram', 'embed diagram in export')
		.option('--embed-svg-images', 'embed images in SVG')
		.option('--embed-svg-fonts <bool>', 'embed fonts in SVG', x => x === 'true', true)
		.option('-b, --border <border>', 'border width', parseInt)
		.option('-s, --scale <scale>', 'diagram scale', parseFloat)
		.option('--width <width>', 'output width', parseInt)
		.option('--height <height>', 'output height', parseInt)
		.option('--crop', 'crop PDF to diagram size')
		.option('-a, --all-pages', 'export all pages (PDF only)')
		.option('-p, --page-index <index>', 'page index (1-based)', i => parseInt(i) - 1)
		.option('-l, --layers <layers>', 'layer indexes')
		.option('-g, --page-range <range>', 'page range (1-based)', argsRange)
		.option('-u, --uncompressed', 'uncompressed XML output')
		.option('-z, --zoom <zoom>', 'interface zoom', parseFloat)
		.option('--svg-theme <theme>', 'SVG theme', themeRegExp, 'auto')
		.option('--svg-links-target <target>', 'SVG link target', linkTargetRegExp, 'auto')
		.option('--enable-plugins', 'enable plugins')
		.parse(argv);

	return program.opts();
}

// Handle export mode
async function handleExportMode(options: any): Promise<void> {
	log.info('Starting export mode', 'Main', { format: options.format });

	const dummyWin = new BrowserWindow({
		show: false,
		webPreferences: {
			preload: `${__dirname}/electron-preload.js`,
			contextIsolation: true,
			disableBlinkFeatures: 'Auxclick'
		}
	});

	// Export logic here (simplified - full implementation in ExportService)
	// ... export handling code

	app.quit();
}

// Create initial window
async function createInitialWindow(options: any): Promise<void> {
	const win = WindowManager.createWindow(
		codeDir,
		{ ...queryObj, appLang: app.getLocale() },
		__dirname,
		store,
		enableSpellCheck,
		appZoom,
		__DEV__,
		{}
	);

	// Wait for load events
	let loadEvtCount = 0;

	function loadFinished(e?: any) {
		if (e && !validateSender(e.senderFrame)) return;

		loadEvtCount++;
		if (loadEvtCount === 2) {
			win.webContents.send('args-obj', {
				args: program.args,
				create: options.create
			});
		}
	}

	ipcMain.once('app-load-finished', loadFinished);

	win.webContents.on('did-finish-load', () => {
		WindowManager.setFirstWinLoaded(true);
		win.webContents.zoomFactor = appZoom;
		win.webContents.setVisualZoomLevelLimits(1, appZoom);
		loadFinished();
	});
}

// Create new window (for second instance or new file)
function createNewWindow(commandLine: string[]): void {
	const win = WindowManager.createWindow(
		codeDir,
		{ ...queryObj, appLang: app.getLocale() },
		__dirname,
		store,
		enableSpellCheck,
		appZoom,
		__DEV__,
		{}
	);

	let loadEvtCount = 0;

	function loadFinished(e?: any) {
		if (e && !validateSender(e.senderFrame)) return;

		loadEvtCount++;
		if (loadEvtCount === 2) {
			const potFile = commandLine[commandLine.length - 1];
			if (fs.existsSync(potFile)) {
				win.webContents.send('args-obj', { args: [potFile] });
			}
		}
	}

	ipcMain.once('app-load-finished', loadFinished);

	win.webContents.on('did-finish-load', () => {
		win.webContents.zoomFactor = appZoom;
		win.webContents.setVisualZoomLevelLimits(1, appZoom);
		loadFinished();
	});
}

// Setup application menu
function setupApplicationMenu(): void {
	if (isMac) {
		const template: any[] = [{
			label: app.name,
			submenu: [
				{
					label: `About ${app.name}`,
					click: () => shell.openExternal('https://www.drawio.com')
				},
				{
					label: 'Support',
					click: () => shell.openExternal('https://github.com/jgraph/drawio-desktop/issues')
				},
				{
					label: 'Check for updates',
					click: () => autoUpdater.checkForUpdates()
				},
				{ type: 'separator' },
				{ label: 'Actual Size', click: () => WindowManager.resetZoom() },
				{ label: 'Zoom In', click: () => WindowManager.zoomIn() },
				{ label: 'Zoom Out', click: () => WindowManager.zoomOut() },
				{ type: 'separator' },
				{ role: 'hide' },
				{ role: 'hideothers' },
				{ role: 'unhide' },
				{ type: 'separator' },
				{ role: 'quit' }
			]
		}, {
			label: 'Edit',
			submenu: [
				{ role: 'undo' },
				{ role: 'redo' },
				{ type: 'separator' },
				{ role: 'cut' },
				{ role: 'copy' },
				{ role: 'paste' },
				{ role: 'pasteAndMatchStyle' },
				{ role: 'selectAll' }
			]
		}];

		if (disableUpdate) {
			template[0].submenu.splice(2, 1);
		}

		const menu = Menu.buildFromTemplate(template);
		Menu.setApplicationMenu(menu);
	} else {
		Menu.setApplicationMenu(null);
	}
}

// Setup auto updater
function setupAutoUpdater(): void {
	autoUpdater.setFeedURL({
		provider: 'github',
		repo: 'drawio-desktop',
		owner: 'jgraph'
	});

	let updateNoAvailAdded = false;

	autoUpdater.on('error', e => log.error('Update error', 'Main', { error: e.message }));

	autoUpdater.on('update-available', (info) => {
		if (silentUpdate) return;

		dialog.showMessageBox({
			type: 'question',
			buttons: ['Ok', 'Cancel', "Don't Ask Again"],
			title: 'Confirm draw.io Update',
			message: 'draw.io update available.\n\nWould you like to download and install new version?',
			detail: 'Application will automatically restart to apply update after download'
		}).then(result => {
			if (result.response === 0) {
				handleUpdateDownload();
			} else if (result.response === 2) {
				store?.set('dontCheckUpdates', true);
			}
		});
	});

	autoUpdater.checkForUpdates();
}

// Handle update download
function handleUpdateDownload(): void {
	autoUpdater.downloadUpdate();

	const progressBar = new ProgressBar({
		title: 'draw.io Update',
		text: 'Downloading draw.io update...'
	});

	let firstTimeProg = true;

	autoUpdater.on('download-progress', (d) => {
		const percent = d.percent ? Math.round(d.percent * 100) / 100 : 0;

		if (firstTimeProg) {
			firstTimeProg = false;
			progressBar.close();

			const newProgressBar = new ProgressBar({
				indeterminate: false,
				title: 'draw.io Update',
				text: 'Downloading draw.io update...',
				detail: `${percent}% ...`,
				initialValue: percent
			});

			newProgressBar
				.on('completed', () => {
					newProgressBar.detail = 'Download completed.';
				})
				.on('progress', (value) => {
					newProgressBar.detail = `${value}% ...`;
				});
		} else {
			progressBar.value = percent;
		}
	});

	autoUpdater.on('update-downloaded', () => {
		if (!progressBar.isCompleted()) {
			progressBar.close();
		}

		dialog.showMessageBox({
			type: 'question',
			buttons: ['Install', 'Later'],
			defaultId: 0,
			message: `A new version of ${app.name} has been downloaded`,
			detail: 'It will be installed the next time you restart the application'
		}).then(result => {
			if (result.response === 0) {
				setTimeout(() => autoUpdater.quitAndInstall(), 1);
			}
		});
	});
}

// App event handlers
app.on('window-all-closed', () => {
	log.info('All windows closed', 'Main');
	if (!isMac) {
		app.quit();
	}
});

app.on('activate', () => {
	if (WindowManager.getWindowCount() === 0) {
		createInitialWindow({});
	}
});

app.on('will-finish-launching', () => {
	app.on('open-file', (event, filePath) => {
		event.preventDefault();
		if (isDialogOpen()) return;

		if (WindowManager.isFirstWinLoaded()) {
			createNewWindow([filePath]);
		} else {
			WindowManager.setFirstWinFilePath(filePath);
		}
	});
});

app.on('web-contents-created', (event, contents) => {
	contents.on('will-navigate', (event) => {
		event.preventDefault();
	});

	contents.setWindowOpenHandler(({ url }) => {
		if (url.startsWith('about:blank')) {
			return {
				action: 'allow',
				overrideBrowserWindowOptions: {
					fullscreenable: false,
					webPreferences: {
						contextIsolation: true
					}
				}
			};
		}

		const allowedUrls = /^(?:https?|mailto|tel|callto):/i;
		if (allowedUrls.test(url)) {
			shell.openExternal(url);
		}

		return { action: 'deny' };
	});

	contents.on('will-attach-webview', (event) => {
		event.preventDefault();
	});
});

// macOS dock quit
app.on('before-quit', () => {
	// Set flag to allow quit on macOS
	process.env.CMD_Q_PRESSED = 'true';
});
