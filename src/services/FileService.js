/**
 * File Service for draw.io Desktop
 * Handles all file operations with security validation and error handling
 */
import fs from 'fs';
import { promises as fsProm } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { app } from 'electron';
import { logger } from '../utils/logger.js';
import {
	isValidPath,
	isOutsideAppDir,
	validateFileSize,
	validateFileContent,
	sanitizeFilename,
	SECURITY_CONFIG
} from '../utils/security.js';
import {
	FileError,
	AppError,
	ErrorCodes,
	getUserFriendlyError
} from '../utils/error-handler.js';

const log = logger.child('FileService');

// File prefixes and extensions
const DRAFT_PREFEX = '.$';
const OLD_DRAFT_PREFEX = '~$';
const DRAFT_EXT = '.dtmp';
const BKP_PREFEX = '.$';
const OLD_BKP_PREFEX = '~$';
const BKP_EXT = '.bkp';

// File system flags
const { O_SYNC, O_CREAT, O_WRONLY, O_TRUNC, O_RDONLY } = fs.constants;

// Get app base directory for security checks
function getAppBaseDir(): string {
	const __dirname = path.dirname(new URL(import.meta.url).pathname);
	return path.join(__dirname, __dirname.endsWith(path.join('resources', 'app.asar', 'src', 'services'))
		? '/../../../../'
		: '/../../');
}

const appBaseDir = getAppBaseDir();
const isWin = process.platform === 'win32';

/**
 * Validates file content type based on headers/magic bytes
 * Enhanced version from original with better validation
 */
export function checkFileContent(body: string | Buffer | Uint8Array, enc?: string): boolean {
	if (body == null) return false;

	let head: string;
	let headBinary: Buffer;

	if (typeof body === 'string') {
		if (enc === 'base64') {
			headBinary = Buffer.from(body.substring(0, 22), 'base64');
			head = headBinary.toString();
		} else {
			head = body.substring(0, 16);
			headBinary = Buffer.from(head);
		}
	} else if (body instanceof Uint8Array) {
		head = new TextDecoder('utf-8').decode(body.subarray(0, 16));
		headBinary = Buffer.from(body.subarray(0, 16));
	} else {
		head = new TextDecoder('utf-8').decode(body.subarray(0, 16));
		headBinary = Buffer.from(body.subarray(0, 16));
	}

	const c = head.split('');
	const cc = Array.from(headBinary);

	// XML/HTML files
	if (c[0] === '<') {
		// HTML
		if (c[1] === '!' ||
			(c[1] === 'h' && c[2] === 't' && c[3] === 'm' && c[4] === 'l') ||
			(c[1] === 'H' && c[2] === 'T' && c[3] === 'M' && c[4] === 'L') ||
			(c[1] === 'b' && c[2] === 'o' && c[3] === 'd' && c[4] === 'y') ||
			(c[1] === 'B' && c[2] === 'O' && c[3] === 'D' && c[4] === 'Y')) {
			return true;
		}

		// XML declaration
		if (c[1] === '?' && c[2] === 'x' && c[3] === 'm' && c[4] === 'l') {
			return true;
		}

		// SVG
		if (c[1] === 's' && c[2] === 'v' && c[3] === 'g') {
			return true;
		}

		// mxGraphModel, mxfile, mxlibrary
		if (c[1] === 'm' && c[2] === 'x') {
			return true;
		}

		// img and iframe tags
		if ((c[1] === 'i' && c[2] === 'm' && c[3] === 'g') ||
			(c[1] === 'i' && c[2] === 'f' && c[3] === 'r' && c[4] === 'a' && c[5] === 'm' && c[6] === 'e')) {
			return true;
		}
	}

	// UTF-8 BOM
	if (cc[0] === 0xef && cc[1] === 0xbb && cc[2] === 0xbf) {
		if (c[3] === '<' && c[4] === '?' && c[5] === 'x') {
			return true;
		}
	}

	// UTF-16 BE BOM
	if (cc[0] === 0xfe && cc[1] === 0xff) {
		if (cc[2] === 0 && c[3] === '<' && cc[4] === 0 && c[5] === '?' &&
			cc[6] === 0 && c[7] === 'x') {
			return true;
		}
	}

	// UTF-16 LE BOM
	if (cc[0] === 0xff && cc[1] === 0xfe) {
		if (c[2] === '<' && cc[3] === 0 && c[4] === '?' && cc[5] === 0) {
			return true;
		}
	}

	// UTF-32 BE BOM
	if (cc[0] === 0x00 && cc[1] === 0x00 && cc[2] === 0xfe && cc[3] === 0xff) {
		return true;
	}

	// UTF-32 LE BOM
	if (cc[0] === 0xff && cc[1] === 0xfe && cc[2] === 0x00 && cc[3] === 0x00) {
		return true;
	}

	// PDF
	if (cc[0] === 0x25 && cc[1] === 0x50 && cc[2] === 0x44 && cc[3] === 0x46) {
		return true;
	}

	// PNG
	if ((cc[0] === 0x89 && cc[1] === 0x50 && cc[2] === 0x4e && cc[3] === 0x47) ||
		(cc[0] === 0xc2 && cc[1] === 0x89 && cc[2] === 0x50 && cc[3] === 0x4e)) {
		return true;
	}

	// JPEG
	if (cc[0] === 0xff && cc[1] === 0xd8 && cc[2] === 0xff) {
		if (cc[3] === 0xe0 || cc[3] === 0xee || cc[3] === 0xe1) {
			return true;
		}
	}

	// WebP
	if (cc[0] === 0x52 && cc[1] === 0x49 && cc[2] === 0x46 && cc[3] === 0x46) {
		if (cc[8] === 0x57 && cc[9] === 0x45 && cc[10] === 0x42 && cc[11] === 0x50) {
			return true;
		}
	}

	// ZIP-based formats (VSDX, etc.)
	if (cc[0] === 0x50 && cc[1] === 0x4b && cc[2] === 0x03) {
		if (cc[3] === 0x04 || cc[3] === 0x06) {
			return true;
		}
	}

	// JSON
	if (c[0] === '{' || c[0] === '[') {
		return true;
	}

	return false;
}

/**
 * Check for file conflicts
 */
export function isConflict(origStat: { mtimeMs: number } | null, stat: { mtimeMs: number } | null): boolean {
	return stat != null && origStat != null && stat.mtimeMs !== origStat.mtimeMs;
}

/**
 * Get draft file name for a file
 */
export function getDraftFileName(fileObject: { path: string }): string {
	const filePath = fileObject.path;
	let draftFileName = '';
	let counter = 1;
	let uniquePart = '';

	do {
		draftFileName = path.join(
			path.dirname(filePath),
			DRAFT_PREFEX + path.basename(filePath) + uniquePart + DRAFT_EXT
		);
		uniquePart = `_${counter++}`;
	} while (fs.existsSync(draftFileName));

	return draftFileName;
}

/**
 * Get all drafts for a file
 */
export async function getFileDrafts(fileObject: { path: string }): Promise<Array<{
	data: string;
	created: number;
	modified: number;
	path: string;
}>> {
	const filePath = fileObject.path;
	const draftsPaths: string[] = [];
	const drafts: Array<{ data: string; created: number; modified: number; path: string }> = [];

	// Find new format drafts
	let draftFileName: string | null = null;
	let counter = 1;
	let uniquePart = '';

	do {
		if (draftFileName) draftsPaths.push(draftFileName);
		draftFileName = path.join(
			path.dirname(filePath),
			DRAFT_PREFEX + path.basename(filePath) + uniquePart + DRAFT_EXT
		);
		uniquePart = `_${counter++}`;
	} while (fs.existsSync(draftFileName));

	// Migrate old format drafts
	counter = 1;
	uniquePart = '';
	let oldDraftExists = false;

	do {
		const oldDraftFileName = path.join(
			path.dirname(filePath),
			OLD_DRAFT_PREFEX + path.basename(filePath) + uniquePart + DRAFT_EXT
		);
		oldDraftExists = fs.existsSync(oldDraftFileName);

		if (oldDraftExists) {
			const newDraftFileName = path.join(
				path.dirname(filePath),
				DRAFT_PREFEX + path.basename(filePath) + uniquePart + DRAFT_EXT
			);
			try {
				await fsProm.rename(oldDraftFileName, newDraftFileName);
				draftsPaths.push(newDraftFileName);
			} catch (e) {
				log.warn('Failed to migrate old draft file', 'FileService', { path: oldDraftFileName });
			}
		}

		uniquePart = `_${counter++}`;
	} while (oldDraftExists);

	// Read draft contents
	for (let i = 1; i < draftsPaths.length; i++) {
		try {
			const stat = await fsProm.lstat(draftsPaths[i]);
			const data = await fsProm.readFile(draftsPaths[i], 'utf8');
			drafts.push({
				data,
				created: stat.ctimeMs,
				modified: stat.mtimeMs,
				path: draftsPaths[i]
			});
		} catch (e) {
			log.debug('Failed to read draft file', 'FileService', { path: draftsPaths[i] });
		}
	}

	return drafts;
}

/**
 * Save a draft file
 */
export async function saveDraft(fileObject: { path: string; draftFileName?: string }, data: string): Promise<string> {
	const draftFileName = fileObject.draftFileName || getDraftFileName(fileObject);

	// Validate data
	if (!checkFileContent(data) || !isOutsideAppDir(draftFileName)) {
		throw new FileError('Invalid file data', ErrorCodes.FILE_INVALID, draftFileName);
	}

	// Validate size
	if (!validateFileSize(draftFileName) || !validateFileContent(data)) {
		throw new FileError('File too large', ErrorCodes.FILE_TOO_LARGE, draftFileName);
	}

	await fsProm.writeFile(draftFileName, data, 'utf8');

	// Set hidden attribute on Windows
	if (isWin) {
		try {
			const child = spawn('attrib', ['+h', draftFileName]);
			child.on('error', (err) => {
				log.debug('Failed to hide draft file', 'FileService', { error: err.message });
			});
		} catch (e) {
			log.debug('Failed to spawn attrib', 'FileService');
		}
	}

	log.info('Draft saved', 'FileService', { path: draftFileName });
	return draftFileName;
}

/**
 * Save file with backup and conflict detection
 */
export async function saveFile(
	fileObject: { path: string; encoding?: string },
	data: string,
	origStat: { mtimeMs: number } | null,
	overwrite: boolean,
	defEnc?: string,
	enableStoreBkp: boolean = true
): Promise<fs.Stats> {
	// Validate path
	if (!isOutsideAppDir(fileObject.path)) {
		throw new FileError('Cannot save to application directory', ErrorCodes.SECURITY_VIOLATION, fileObject.path);
	}

	// Validate data
	if (!checkFileContent(data) || !validateFileContent(data)) {
		throw new FileError('Invalid file data', ErrorCodes.FILE_INVALID, fileObject.path);
	}

	// Validate size
	if (!validateFileSize(fileObject.path)) {
		throw new FileError('File too large', ErrorCodes.FILE_TOO_LARGE, fileObject.path);
	}

	const writeEnc = defEnc || fileObject.encoding || 'utf8';
	const bkpPath = path.join(
		path.dirname(fileObject.path),
		BKP_PREFEX + path.basename(fileObject.path) + BKP_EXT
	);
	const oldBkpPath = path.join(
		path.dirname(fileObject.path),
		OLD_BKP_PREFEX + path.basename(fileObject.path) + BKP_EXT
	);

	let retryCount = 0;
	let backupCreated = false;

	const writeFile = async (): Promise<fs.Stats> => {
		let fh;

		try {
			// Open file with sync flags for durability
			fh = await fsProm.open(fileObject.path, O_SYNC | O_CREAT | O_WRONLY | O_TRUNC);
			await fsProm.writeFile(fh, data, writeEnc);
			await fh.sync();
		} finally {
			await fh?.close();
		}

		// Verify write by reading back
		const stat2 = await fsProm.stat(fileObject.path);
		const writtenData = await fsProm.readFile(fileObject.path, writeEnc);

		if (data !== writtenData) {
			retryCount++;
			if (retryCount < 3) {
				log.warn(`Write verification failed, retrying (${retryCount}/3)`, 'FileService');
				await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
				return writeFile();
			}
			throw new FileError('Write verification failed after retries', ErrorCodes.FILE_INVALID, fileObject.path);
		}

		// Cleanup backup on success
		if (backupCreated) {
			if (fs.existsSync(oldBkpPath)) {
				fs.unlink(oldBkpPath, () => {});
			}
		}

		return stat2;
	};

	const doSaveFile = async (isNew: boolean): Promise<fs.Stats> => {
		// Create backup for existing files
		if (enableStoreBkp && !isNew) {
			let bkpFh;
			try {
				const fileContent = await fsProm.readFile(fileObject.path, writeEnc);
				bkpFh = await fsProm.open(bkpPath, O_SYNC | O_CREAT | O_WRONLY | O_TRUNC);
				await fsProm.writeFile(bkpFh, fileContent, writeEnc);
				await bkpFh.sync();
				backupCreated = true;

				// Set hidden on Windows
				if (isWin) {
					const child = spawn('attrib', ['+h', bkpPath]);
					child.on('error', () => {});
				}
			} catch (e) {
				log.debug('Backup creation failed', 'FileService', { path: fileObject.path });
			} finally {
				await bkpFh?.close();
			}
		}

		return writeFile();
	};

	// Check for conflicts
	if (overwrite) {
		return doSaveFile(true);
	}

	const stat = fs.existsSync(fileObject.path) ? await fsProm.stat(fileObject.path) : null;

	if (stat && isConflict(origStat, stat)) {
		throw new FileError('File conflict detected', ErrorCodes.FILE_CONFLICT, fileObject.path);
	}

	return doSaveFile(stat == null);
}

/**
 * Write file directly
 */
export async function writeFile(filePath: string, data: string | Buffer, enc?: string): Promise<void> {
	if (!isOutsideAppDir(filePath)) {
		throw new FileError('Cannot write to application directory', ErrorCodes.SECURITY_VIOLATION, filePath);
	}

	if (!checkFileContent(data, enc) || !validateFileContent(data)) {
		throw new FileError('Invalid file data', ErrorCodes.FILE_INVALID, filePath);
	}

	if (!validateFileSize(filePath)) {
		throw new FileError('File too large', ErrorCodes.FILE_TOO_LARGE, filePath);
	}

	let fh;
	try {
		fh = await fsProm.open(filePath, O_SYNC | O_CREAT | O_WRONLY | O_TRUNC);
		await fsProm.writeFile(fh, data, enc);
		await fh.sync();
	} finally {
		await fh?.close();
	}
}

/**
 * Read file with security checks
 */
export async function readFile(filename: string, encoding?: string): Promise<string | Buffer> {
	if (!isOutsideAppDir(filename)) {
		throw new FileError('Cannot read from application directory', ErrorCodes.SECURITY_VIOLATION, filename);
	}

	if (!validateFileSize(filename)) {
		throw new FileError('File too large', ErrorCodes.FILE_TOO_LARGE, filename);
	}

	const data = await fsProm.readFile(filename, encoding);

	if (!checkFileContent(data, encoding)) {
		throw new FileError('Invalid file content', ErrorCodes.FILE_INVALID, filename);
	}

	return data;
}

/**
 * Get file statistics
 */
export async function fileStat(file: string): Promise<fs.Stats> {
	return await fsProm.stat(file);
}

/**
 * Check if file is writable
 */
export async function isFileWritable(file: string): Promise<boolean> {
	try {
		await fsProm.access(file, fs.constants.W_OK);
		return true;
	} catch (e) {
		return false;
	}
}

/**
 * Delete file securely
 */
export async function deleteFile(file: string): Promise<void> {
	// Verify file header before deletion
	let fh = await fsProm.open(file, O_RDONLY);
	let buffer = Buffer.allocUnsafe(16);
	await fh.read(buffer, 0, 16);
	await fh.close();

	if (!checkFileContent(buffer) || !isOutsideAppDir(file)) {
		throw new FileError('Invalid file or protected location', ErrorCodes.SECURITY_VIOLATION, file);
	}

	await fsProm.unlink(file);
	log.info('File deleted', 'FileService', { path: file });
}

/**
 * Get application data folder
 */
export function getAppDataFolder(): string {
	try {
		const appDataDir = app.getPath('appData');
		const drawioDir = path.join(appDataDir, 'draw.io');

		if (!fs.existsSync(drawioDir)) {
			fs.mkdirSync(drawioDir, { recursive: true });
		}

		return drawioDir;
	} catch (e) {
		log.error('Failed to get app data folder', 'FileService', { error: (e as Error).message });
		return '.';
	}
}

/**
 * Get documents folder
 */
export function getDocumentsFolder(): string {
	try {
		return app.getPath('documents');
	} catch (e) {
		log.error('Failed to get documents folder', 'FileService');
		return '.';
	}
}

/**
 * Check if file exists
 */
export function checkFileExists(pathParts: string[]): { exists: boolean; path: string } {
	const filePath = path.join(...pathParts);
	return { exists: fs.existsSync(filePath), path: filePath };
}

/**
 * Get directory name
 */
export function dirname(path_p: string): string {
	return path.dirname(path_p);
}
