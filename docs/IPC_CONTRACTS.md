# IPC Communication Contracts

This document defines the IPC (Inter-Process Communication) interfaces between the renderer (draw.io web app) and the main Electron process.

## Overview

The application uses a request-response pattern for IPC communication with the following characteristics:
- All IPC calls are validated for sender origin
- Rate limiting is applied to prevent abuse
- Structured error handling with user-friendly messages

## Message Structure

### Request
```typescript
interface IPCRequest {
  action: string;        // Action to perform
  reqId?: number;        // Request ID for tracking (auto-assigned)
  [key: string]: any;    // Action-specific parameters
}
```

### Response
```typescript
interface IPCResponse {
  success?: boolean;     // true if operation succeeded
  error?: boolean;       // true if operation failed
  msg?: string;          // Error message (if error)
  data?: any;            // Response data (if success)
  e?: Error;             // Original error object
  reqId?: number;        // Matching request ID
}
```

## Actions

### File Operations

#### `saveFile`
Saves a file with backup and conflict detection.

**Parameters:**
```typescript
{
  fileObject: {
    path: string;        // File path
    encoding?: string;   // File encoding
  };
  data: string;          // File content
  origStat: {            // Original file stats
    mtimeMs: number;
  } | null;
  overwrite: boolean;    // Overwrite without conflict check
  defEnc?: string;       // Default encoding
}
```

**Returns:** `fs.Stats` - Stats of saved file

**Errors:**
- `FILE_INVALID` - Invalid file content
- `FILE_TOO_LARGE` - Exceeds maximum size
- `FILE_CONFLICT` - File modified by another process
- `SECURITY_VIOLATION` - Attempt to save to protected location

---

#### `writeFile`
Writes file directly without backup.

**Parameters:**
```typescript
{
  path: string;
  data: string | Buffer;
  enc?: string;
}
```

**Returns:** `null`

---

#### `saveDraft`
Saves a draft copy of the file.

**Parameters:**
```typescript
{
  fileObject: {
    path: string;
    draftFileName?: string;
  };
  data: string;
}
```

**Returns:** `string` - Draft file path

---

#### `getFileDrafts`
Retrieves all draft files for a given file.

**Parameters:**
```typescript
{
  fileObject: {
    path: string;
  };
}
```

**Returns:** `Array<{data, created, modified, path}>`

---

#### `readFile`
Reads file content securely.

**Parameters:**
```typescript
{
  filename: string;
  encoding?: string;
}
```

**Returns:** `string | Buffer`

**Errors:**
- `FILE_NOT_FOUND` - File doesn't exist
- `FILE_ACCESS_DENIED` - No read permission
- `SECURITY_VIOLATION` - Attempt to read from protected location

---

#### `deleteFile`
Deletes a file after validation.

**Parameters:**
```typescript
{
  file: string;
}
```

**Returns:** `null`

---

#### `fileStat`
Gets file statistics.

**Parameters:**
```typescript
{
  file: string;
}
```

**Returns:** `fs.Stats`

---

#### `isFileWritable`
Checks if file is writable.

**Parameters:**
```typescript
{
  file: string;
}
```

**Returns:** `boolean`

---

#### `checkFileExists`
Checks if a file exists.

**Parameters:**
```typescript
{
  pathParts: string[];   // Path components to join
}
```

**Returns:** `{exists: boolean, path: string}`

---

### Dialog Operations

#### `showOpenDialog`
Shows file open dialog.

**Parameters:**
```typescript
{
  defaultPath?: string;
  filters?: Array<{name: string, extensions: string[]}>;
  properties?: string[];  // e.g., ['openFile', 'multiSelections']
}
```

**Returns:** `string[]` - Selected file paths

---

#### `showSaveDialog`
Shows save file dialog.

**Parameters:**
```typescript
{
  defaultPath?: string;
  filters?: Array<{name: string, extensions: string[]}>;
}
```

**Returns:** `string | null` - Selected path or null if cancelled

---

### Clipboard Operations

#### `clipboardAction`
Performs clipboard operations.

**Parameters:**
```typescript
{
  method: 'writeText' | 'readText' | 'writeImage';
  data?: any;
}
```

**Returns:** Depends on method
- `writeText`: `null`
- `readText`: `string`
- `writeImage`: `null`

---

### Window Operations

#### `windowAction`
Controls window state.

**Parameters:**
```typescript
{
  method: 'minimize' | 'maximize' | 'unmaximize' | 'close' | 'isMaximized' | 'removeAllListeners';
}
```

**Returns:** Depends on method
- `isMaximized`: `boolean`
- Others: `null`

---

### External Links

#### `openExternal`
Opens URL in external browser.

**Parameters:**
```typescript
{
  url: string;
}
```

**Returns:** `boolean` - Whether URL was opened (only http/https/mailto/tel/callto allowed)

---

### File Watching

#### `watchFile`
Starts watching file for changes.

**Parameters:**
```typescript
{
  path: string;
}
```

**Returns:** `null`

**Events:** Emits `fileChanged` event with `{path, curr, prev}`

---

#### `unwatchFile`
Stops watching file.

**Parameters:**
```typescript
{
  path: string;
}
```

**Returns:** `null`

---

### Plugin Operations

#### `installPlugin`
Installs a plugin file.

**Parameters:**
```typescript
{
  filePath: string;
}
```

**Returns:** `{pluginName: string, selDir: string}`

**Errors:**
- `PLUGIN_EXISTS` - Plugin already installed
- `INSTALL_FAILED` - Installation failed

---

#### `uninstallPlugin`
Removes a plugin.

**Parameters:**
```typescript
{
  plugin: string;   // Plugin filename
}
```

**Returns:** `null`

---

#### `getPluginFile`
Gets plugin file path.

**Parameters:**
```typescript
{
  plugin: string;
}
```

**Returns:** `string | null`

---

#### `isPluginsEnabled`
Checks if plugins are enabled.

**Parameters:** `{}`

**Returns:** `boolean`

---

### System Operations

#### `getDocumentsFolder`
Gets user's documents folder.

**Returns:** `string`

---

#### `dirname`
Gets directory name from path.

**Parameters:**
```typescript
{
  path: string;
}
```

**Returns:** `string`

---

#### `exit`
Quits the application.

**Returns:** `null`

---

#### `isFullscreen`
Checks if window is fullscreen.

**Returns:** `boolean`

---

## Preload API

The renderer process can access these methods via `window.electron`:

```javascript
// Request-response
window.electron.request(message, callback, errorCallback);

// Register listener for messages from main
window.electron.registerMsgListener(action, callback);

// Send one-way message
window.electron.sendMessage(action, args);

// Listen once
window.electron.listenOnce(action, callback);

// Remove all listeners
window.electron.removeAllListeners(action);
```

## Security Considerations

1. **Sender Validation**: All IPC handlers validate the sender frame URL matches `codeUrl`
2. **Path Validation**: All file paths are validated to be outside the application directory
3. **Rate Limiting**: 100 requests per minute per window
4. **Size Limits**: Maximum file size of 100MB
5. **Content Validation**: File contents are checked for malicious patterns
6. **URL Whitelist**: Only http, https, mailto, tel, and callto URLs can be opened externally

## Error Codes

| Code | Description |
|------|-------------|
| `FILE_NOT_FOUND` | File does not exist |
| `FILE_ACCESS_DENIED` | Permission denied |
| `FILE_TOO_LARGE` | Exceeds 100MB limit |
| `FILE_INVALID` | Invalid content or format |
| `FILE_CONFLICT` | File modified externally |
| `PATH_TRAVERSAL` | Invalid path detected |
| `SECURITY_VIOLATION` | Security check failed |
| `EXPORT_FAILED` | Export operation failed |
| `TIMEOUT` | Operation timed out |
| `UNKNOWN_ERROR` | Unexpected error |
