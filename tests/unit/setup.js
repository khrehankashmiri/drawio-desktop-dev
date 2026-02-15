/**
 * Test Setup for Vitest
 */
import { vi } from 'vitest';

// Mock Electron modules
global.electronMock = {
	app: {
		getPath: vi.fn((name) => `/mock/${name}`),
		getVersion: vi.fn(() => '29.3.6'),
		getLocale: vi.fn(() => 'en-US'),
		quit: vi.fn(),
		whenReady: vi.fn(() => Promise.resolve()),
		requestSingleInstanceLock: vi.fn(() => true),
		on: vi.fn()
	},
	BrowserWindow: vi.fn(() => ({
		loadURL: vi.fn(),
		on: vi.fn(),
		once: vi.fn(),
		webContents: {
			send: vi.fn(),
			on: vi.fn(),
			openDevTools: vi.fn(),
			zoomFactor: 1,
			setVisualZoomLevelLimits: vi.fn()
		},
		destroy: vi.fn(),
		close: vi.fn(),
		show: vi.fn(),
		getSize: vi.fn(() => [1200, 800]),
		getPosition: vi.fn(() => [0, 0]),
		isMaximized: vi.fn(() => false),
		isFullScreen: vi.fn(() => false),
		setFullScreen: vi.fn(),
		maximize: vi.fn(),
		unmaximize: vi.fn(),
		minimize: vi.fn()
	})),
	ipcMain: {
		on: vi.fn(),
		once: vi.fn(),
		removeAllListeners: vi.fn()
	},
	dialog: {
		showOpenDialog: vi.fn(() => Promise.resolve({ filePaths: [], canceled: false })),
		showSaveDialog: vi.fn(() => Promise.resolve({ filePath: '', canceled: false })),
		showMessageBox: vi.fn(() => Promise.resolve({ response: 0 })),
		showMessageBoxSync: vi.fn(() => 0)
	},
	shell: {
		openExternal: vi.fn()
	},
	session: {
		defaultSession: {
			webRequest: {
				onHeadersReceived: vi.fn(),
				onBeforeRequest: vi.fn()
			}
		}
	},
	screen: {
		getAllDisplays: vi.fn(() => [{
			workArea: { x: 0, y: 0, width: 1920, height: 1080 }
		}])
	},
	clipboard: {
		writeText: vi.fn(),
		readText: vi.fn(() => ''),
		availableFormats: vi.fn(() => ['text/plain']),
		write: vi.fn(),
		readImage: vi.fn(() => ({ isEmpty: () => true }))
	},
	nativeImage: {
		createFromDataURL: vi.fn(() => ({}))
	},
	Menu: {
		buildFromTemplate: vi.fn(() => ({})),
		setApplicationMenu: vi.fn()
	}
};

// Mock fs
vi.mock('fs', () => ({
	default: {
		existsSync: vi.fn(() => false),
		readFileSync: vi.fn(() => ''),
		writeFileSync: vi.fn(),
		statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false })),
		readdirSync: vi.fn(() => []),
		mkdirSync: vi.fn(),
		unlinkSync: vi.fn(),
		watchFile: vi.fn(),
		unwatchFile: vi.fn(),
		constants: {
			O_SYNC: 0,
			O_CREAT: 0,
			O_WRONLY: 0,
			O_TRUNC: 0,
			O_RDONLY: 0,
			W_OK: 0
		}
	},
	promises: {
		access: vi.fn(() => Promise.resolve()),
		stat: vi.fn(() => Promise.resolve({ mtimeMs: Date.now() })),
		lstat: vi.fn(() => Promise.resolve({ ctimeMs: Date.now(), mtimeMs: Date.now() })),
		readFile: vi.fn(() => Promise.resolve('')),
		writeFile: vi.fn(() => Promise.resolve()),
		unlink: vi.fn(() => Promise.resolve()),
		rename: vi.fn(() => Promise.resolve()),
		copyFile: vi.fn(() => Promise.resolve()),
		open: vi.fn(() => Promise.resolve({
			close: vi.fn(() => Promise.resolve()),
			sync: vi.fn(() => Promise.resolve())
		})),
		mkdir: vi.fn(() => Promise.resolve())
	}
}));

// Mock electron
vi.mock('electron', () => global.electronMock);

// Mock electron-log
vi.mock('electron-log', () => ({
	default: {
		error: vi.fn(),
		warn: vi.fn(),
		info: vi.fn(),
		debug: vi.fn(),
		verbose: vi.fn()
	}
}));

// Mock electron-store
vi.mock('electron-store', () => ({
	default: vi.fn(() => ({
		get: vi.fn(),
		set: vi.fn()
	}))
}));

// Mock child_process
vi.mock('child_process', () => ({
	spawn: vi.fn(() => ({ on: vi.fn() }))
}));

// Global test utilities
global.testUtils = {
	waitFor: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
	createMockEvent: () => ({
		senderFrame: { url: 'file:///mock' },
		reply: vi.fn(),
		sender: { send: vi.fn() }
	}),
	createMockFileObject: (overrides = {}) => ({
		path: '/mock/test.drawio',
		encoding: 'utf8',
		...overrides
	})
};
