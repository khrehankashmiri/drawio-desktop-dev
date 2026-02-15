/**
 * Preload Script for draw.io Desktop
 * ESM version with enhanced security
 */
const { contextBridge, ipcRenderer } = require('electron');

// Request tracking
let reqId = 1;
const reqInfo: Record<number, { callback: Function; error: Function }> = {};
const fileChangedListeners: Record<string, Function> = {};

// Response handler
ipcRenderer.on('mainResp', (event, resp) => {
	const callbacks = reqInfo[resp.reqId];
	if (!callbacks) return;

	if (resp.error) {
		callbacks.error(resp.msg, resp.e);
	} else {
		callbacks.callback(resp.data);
	}

	delete reqInfo[resp.reqId];
});

// File change handler
ipcRenderer.on('fileChanged', (event, resp) => {
	const listener = fileChangedListeners[resp.path];
	if (listener) {
		listener(resp.curr, resp.prev);
	}
});

// Expose secure API to renderer
contextBridge.exposeInMainWorld('electron', {
	/**
	 * Send a request to the main process
	 */
	request: (msg: any, callback: Function, error: Function) => {
		msg.reqId = reqId++;
		reqInfo[msg.reqId] = { callback, error };

		// Handle file watch special case
		if (msg.action === 'watchFile') {
			fileChangedListeners[msg.path] = msg.listener;
			delete msg.listener;
		}

		ipcRenderer.send('rendererReq', msg);
	},

	/**
	 * Register a message listener
	 */
	registerMsgListener: (action: string, callback: Function) => {
		ipcRenderer.on(action, (event, args) => {
			callback(args);
		});
	},

	/**
	 * Send a one-way message
	 */
	sendMessage: (action: string, args?: any) => {
		ipcRenderer.send(action, args);
	},

	/**
	 * Listen for a message once
	 */
	listenOnce: (action: string, callback: Function) => {
		ipcRenderer.once(action, (event, args) => {
			callback(args);
		});
	},

	/**
	 * Remove all listeners for an action
	 */
	removeAllListeners: (action: string) => {
		ipcRenderer.removeAllListeners(action);
	}
});

// Expose limited process info
contextBridge.exposeInMainWorld('process', {
	type: process.type,
	versions: {
		electron: process.versions.electron,
		chrome: process.versions.chrome,
		node: process.versions.node
	}
});

// Log preload initialization
console.log('[Preload] Initialized with context isolation');
