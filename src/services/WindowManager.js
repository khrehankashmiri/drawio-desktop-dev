/**
 * Window Manager for draw.io Desktop
 * Handles window creation, lifecycle, and state management
 */
import { BrowserWindow, screen, ipcMain } from 'electron';
import path from 'path';
import url from 'url';
import { logger } from '../utils/logger.js';
import { isWithinDisplayBounds } from '../utils/display.js';

const log = logger.child('WindowManager');

// Window registry
const windowsRegistry: BrowserWindow[] = [];
let firstWinLoaded = false;
let firstWinFilePath: string | null = null;

// Platform detection
const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';

// Window state management
interface WindowState {
	width: number;
	height: number;
	x?: number;
	y?: number;
	maximized: boolean;
	fullscreen: boolean;
}

interface QueryObject {
	[key: string]: string | number;
}

interface WindowOptions {
	width?: number;
	height?: number;
}

/**
 * Get default window state
 */
function getDefaultWindowState(): WindowState {
	return {
		width: 1200,
		height: 800,
		x: undefined,
		y: undefined,
		maximized: false,
		fullscreen: false
	};
}

/**
 * Parse window state from store string
 */
function parseWindowState(stateStr?: string | null): WindowState {
	if (!stateStr) return getDefaultWindowState();

	const parts = stateStr.split(',');
	if (parts.length < 4) return getDefaultWindowState();

	let width = parseInt(parts[0], 10);
	let height = parseInt(parts[1], 10);
	const x = parseInt(parts[2], 10);
	const y = parseInt(parts[3], 10);
	const maximized = parts[4] === 'true';
	const fullscreen = parts[5] === 'true';

	// Enforce minimum size
	if (width < 500) width = 500;
	if (height < 500) height = 500;

	return { width, height, x, y, maximized, fullscreen };
}

/**
 * Serialize window state to string
 */
function serializeWindowState(state: WindowState): string {
	return `${state.width},${state.height},${state.x ?? 0},${state.y ?? 0},${state.maximized},${state.fullscreen}`;
}

/**
 * Create a new browser window
 */
export function createWindow(
	codeDir: string,
	queryObj: QueryObject,
	__dirname: string,
	store: any,
	enableSpellCheck: boolean,
	appZoom: number,
	__DEV__: boolean,
	opt: WindowOptions = {}
): BrowserWindow {
	const state = parseWindowState(store?.get('lastWinSize'));

	// Merge with provided options
	const options: Electron.BrowserWindowConstructorOptions = {
		backgroundColor: '#FFF',
		width: opt.width || state.width,
		height: opt.height || state.height,
		x: state.x,
		y: state.y,
		icon: `${codeDir}/images/drawlogo256.png`,
		webviewTag: false,
		webSecurity: true,
		webPreferences: {
			preload: `${__dirname}/electron-preload.js`,
			spellcheck: enableSpellCheck,
			contextIsolation: true,
			disableBlinkFeatures: 'Auxclick'
		},
		show: false // Show after load to prevent flash
	};

	// Validate position is within display bounds
	if (state.x != null && state.y != null) {
		const pos = { x: state.x, y: state.y };
		if (!isWithinDisplayBounds(pos)) {
			options.x = undefined;
			options.y = undefined;
		}
	}

	// Create window
	const mainWindow = new BrowserWindow(options);
	windowsRegistry.push(mainWindow);

	// Apply saved state
	if (state.maximized) {
		mainWindow.maximize();
	}
	if (state.fullscreen) {
		mainWindow.setFullScreen(true);
	}

	// Show window when ready
	mainWindow.once('ready-to-show', () => {
		mainWindow.show();
	});

	log.info('Window created', 'WindowManager', {
		id: mainWindow.id,
		width: options.width,
		height: options.height
	});

	// Set up window event handlers
	setupWindowEvents(mainWindow, store, appZoom, __DEV__);

	// Load URL
	const ourl = url.format({
		pathname: `${codeDir}/index.html`,
		protocol: 'file:',
		query: queryObj as any,
		slashes: true
	});

	mainWindow.loadURL(ourl);

	// Open DevTools in dev mode
	if (__DEV__) {
		mainWindow.webContents.openDevTools();
	}

	return mainWindow;
}

/**
 * Set up window event handlers
 */
function setupWindowEvents(
	mainWindow: BrowserWindow,
	store: any,
	appZoom: number,
	__DEV__: boolean
): void {
	// Remember window size on resize/move
	const rememberWinSize = () => {
		if (store == null) return;

		const size = mainWindow.getSize();
		const pos = mainWindow.getPosition();
		const state: WindowState = {
			width: size[0],
			height: size[1],
			x: pos[0],
			y: pos[1],
			maximized: mainWindow.isMaximized(),
			fullscreen: mainWindow.isFullScreen()
		};
		store.set('lastWinSize', serializeWindowState(state));
	};

	mainWindow.on('maximize', () => {
		mainWindow.webContents.send('maximize');
		rememberWinSize();
	});

	mainWindow.on('unmaximize', () => {
		mainWindow.webContents.send('unmaximize');
		rememberWinSize();
	});

	mainWindow.on('resize', () => {
		mainWindow.webContents.send('resize');
		if (!mainWindow.isMaximized()) {
			rememberWinSize();
		}
	});

	mainWindow.on('move', () => {
		if (!mainWindow.isMaximized() && !mainWindow.isFullScreen()) {
			rememberWinSize();
		}
	});

	// Handle close with modified check
	let uniqueIsModifiedId: string | null = null;
	let modifiedModalOpen = false;

	ipcMain.on('isModified-result', async (e, data) => {
		if (uniqueIsModifiedId !== data.uniqueId || modifiedModalOpen) return;

		if (data.isModified) {
			modifiedModalOpen = true;
			// Dialog handling moved to main electron.js
			mainWindow.webContents.send('show-close-confirm', data);
		} else {
			mainWindow.destroy();
		}
	});

	mainWindow.on('close', (event) => {
		uniqueIsModifiedId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

		if (__DEV__) {
			const index = windowsRegistry.indexOf(mainWindow);
			log.debug('Window closing', 'WindowManager', { index, id: uniqueIsModifiedId });
		}

		const contents = mainWindow.webContents;
		if (contents != null) {
			contents.send('isModified', uniqueIsModifiedId);
			event.preventDefault();
		}

		rememberWinSize();
	});

	// Window closed
	mainWindow.on('closed', () => {
		const index = windowsRegistry.indexOf(mainWindow);
		if (__DEV__) {
			log.debug('Window closed', 'WindowManager', { index });
		}
		windowsRegistry.splice(index, 1);
	});

	// Set zoom after load
	mainWindow.webContents.on('did-finish-load', () => {
		mainWindow.webContents.zoomFactor = appZoom;
		mainWindow.webContents.setVisualZoomLevelLimits(1, appZoom);
	});
}

/**
 * Get all registered windows
 */
export function getWindows(): BrowserWindow[] {
	return [...windowsRegistry];
}

/**
 * Get window count
 */
export function getWindowCount(): number {
	return windowsRegistry.length;
}

/**
 * Get first window
 */
export function getFirstWindow(): BrowserWindow | null {
	return windowsRegistry[0] || null;
}

/**
 * Get window by ID
 */
export function getWindowById(id: number): BrowserWindow | undefined {
	return windowsRegistry.find(w => w.id === id);
}

/**
 * Close all windows
 */
export function closeAllWindows(): void {
	windowsRegistry.forEach(window => {
		if (!window.isDestroyed()) {
			window.close();
		}
	});
}

/**
 * Check if first window has loaded
 */
export function isFirstWinLoaded(): boolean {
	return firstWinLoaded;
}

/**
 * Set first window loaded state
 */
export function setFirstWinLoaded(loaded: boolean): void {
	firstWinLoaded = loaded;
}

/**
 * Get first window file path (for macOS open-file event)
 */
export function getFirstWinFilePath(): string | null {
	return firstWinFilePath;
}

/**
 * Set first window file path
 */
export function setFirstWinFilePath(filePath: string | null): void {
	firstWinFilePath = filePath;
}

/**
 * Window action methods
 */
export function minimizeWindow(): void {
	const win = BrowserWindow.getFocusedWindow();
	if (win) win.minimize();
}

export function maximizeWindow(): void {
	const win = BrowserWindow.getFocusedWindow();
	if (win) win.maximize();
}

export function unmaximizeWindow(): void {
	const win = BrowserWindow.getFocusedWindow();
	if (win) win.unmaximize();
}

export function closeWindow(): void {
	const win = BrowserWindow.getFocusedWindow();
	if (win) win.close();
}

export function isMaximized(): boolean {
	const win = BrowserWindow.getFocusedWindow();
	return win ? win.isMaximized() : false;
}

export function isFullScreen(): boolean {
	const win = BrowserWindow.getFocusedWindow();
	return win ? win.isFullScreen() : false;
}

export function setFullScreen(fullscreen: boolean): void {
	const win = BrowserWindow.getFocusedWindow();
	if (win) win.setFullScreen(fullscreen);
}

export function toggleFullScreen(): void {
	const win = BrowserWindow.getFocusedWindow();
	if (win) win.setFullScreen(!win.isFullScreen());
}

export function removeAllListeners(): void {
	const win = BrowserWindow.getFocusedWindow();
	if (win) win.removeAllListeners();
}

/**
 * Zoom functions
 */
const zoomSteps = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];

export function zoomIn(): void {
	const win = BrowserWindow.getFocusedWindow();
	if (!win) return;

	const zoomFactor = win.webContents.zoomFactor;
	let newZoomFactor = zoomSteps[zoomSteps.length - 1];

	for (const step of zoomSteps) {
		if (step - zoomFactor > 0.01) {
			newZoomFactor = step;
			break;
		}
	}

	win.webContents.zoomFactor = newZoomFactor;
}

export function zoomOut(): void {
	const win = BrowserWindow.getFocusedWindow();
	if (!win) return;

	const zoomFactor = win.webContents.zoomFactor;
	let newZoomFactor = zoomSteps[0];

	for (let i = zoomSteps.length - 1; i >= 0; i--) {
		if (zoomSteps[i] - zoomFactor < -0.01) {
			newZoomFactor = zoomSteps[i];
			break;
		}
	}

	win.webContents.zoomFactor = newZoomFactor;
}

export function resetZoom(): void {
	const win = BrowserWindow.getFocusedWindow();
	if (win) win.webContents.zoomFactor = 1;
}
