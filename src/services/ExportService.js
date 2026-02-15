/**
 * Export Service for draw.io Desktop
 * Handles diagram export to various formats (PDF, PNG, SVG, XML)
 */
import { BrowserWindow, ipcMain } from 'electron';
import { PDFDocument } from '@cantoo/pdf-lib';
import zlib from 'zlib';
import crc from 'crc';
import path from 'path';
import { logger } from '../utils/logger.js';
import { ExportError, ErrorCodes } from '../utils/error-handler.js';
import { wrapIPCHandler } from '../utils/error-handler.js';

const log = logger.child('ExportService');

// Constants
const MICRON_TO_PIXEL = 264.58;
const PNG_CHUNK_IDAT = 1229209940;
const LARGE_IMAGE_AREA = 30000000;

// Export options type
interface ExportArgs {
	format: 'pdf' | 'png' | 'jpg' | 'jpeg' | 'svg' | 'xml';
	w?: number | null;
	h?: number | null;
	bg?: string;
	from?: number | null;
	to?: number | null;
	allPages?: boolean;
	scale?: number;
	embedXml?: string;
	embedImages?: string;
	embedFonts?: string;
	jpegQuality?: number;
	uncompressed?: boolean;
	print?: boolean;
	pageScale?: number;
	pageWidth?: number;
	pageHeight?: number;
	border?: number;
	crop?: string;
	base64?: string;
	filename?: string;
	fileTitle?: string;
	csv?: string;
	xmlEncoded?: boolean;
	xml?: string;
	theme?: string;
	linkTarget?: string;
	dpi?: string;
}

interface RenderInfo {
	pageCount: number;
	bounds: string;
}

/**
 * Write PNG with embedded metadata
 */
function writePngWithText(
	origBuff: Buffer,
	key: string,
	text: string,
	compressed: boolean,
	base64encoded: boolean
): Buffer | string {
	const isDpi = key === 'dpi';
	let inOffset = 0;
	let outOffset = 0;
	let data: string | Buffer = text;
	let dataLen = isDpi ? 9 : key.length + text.length + 1;

	if (compressed) {
		data = zlib.deflateRawSync(Buffer.from(encodeURIComponent(text)));
		dataLen = key.length + (data as Buffer).length + 2;
	}

	const outBuff = Buffer.allocUnsafe(origBuff.length + dataLen + 4);

	// Check PNG magic
	const magic1 = origBuff.readUInt32BE(inOffset);
	inOffset += 4;
	const magic2 = origBuff.readUInt32BE(inOffset);
	inOffset += 4;

	if (magic1 !== 0x89504e47 || magic2 !== 0x0d0a1a0a) {
		throw new ExportError('Invalid PNG format');
	}

	outBuff.writeUInt32BE(magic1, outOffset);
	outOffset += 4;
	outBuff.writeUInt32BE(magic2, outOffset);
	outOffset += 4;

	// Process chunks
	while (inOffset < origBuff.length) {
		const length = origBuff.readInt32BE(inOffset);
		inOffset += 4;
		const type = origBuff.readInt32BE(inOffset);
		inOffset += 4;

		if (type === PNG_CHUNK_IDAT) {
			// Insert metadata chunk before IDAT
			outBuff.writeInt32BE(dataLen, outOffset);
			outOffset += 4;

			const typeSignature = isDpi ? 'pHYs' : (compressed ? 'zTXt' : 'tEXt');
			outBuff.write(typeSignature, outOffset);
			outOffset += 4;

			if (isDpi) {
				const dpm = Math.round(parseInt(text) / 0.0254) || 3937;
				outBuff.writeInt32BE(dpm, outOffset);
				outBuff.writeInt32BE(dpm, outOffset + 4);
				outBuff.writeInt8(1, outOffset + 8);
				outOffset += 9;

				data = Buffer.allocUnsafe(9);
				(data as Buffer).writeInt32BE(dpm, 0);
				(data as Buffer).writeInt32BE(dpm, 4);
				(data as Buffer).writeInt8(1, 8);
			} else {
				outBuff.write(key, outOffset);
				outOffset += key.length;
				outBuff.writeInt8(0, outOffset);
				outOffset++;

				if (compressed) {
					outBuff.writeInt8(0, outOffset);
					outOffset++;
					(data as Buffer).copy(outBuff, outOffset);
				} else {
					outBuff.write(data as string, outOffset);
				}
				outOffset += (data as Buffer).length;
			}

			// Calculate and write CRC
			let crcVal = 0xffffffff;
			crcVal = crc.crcjam(typeSignature, crcVal);
			crcVal = crc.crcjam(data, crcVal);
			outBuff.writeInt32BE(crcVal ^ 0xffffffff, outOffset);
			outOffset += 4;

			// Write IDAT chunk
			outBuff.writeInt32BE(length, outOffset);
			outOffset += 4;
			outBuff.writeInt32BE(type, outOffset);
			outOffset += 4;
			origBuff.copy(outBuff, outOffset, inOffset);

			return base64encoded ? outBuff.toString('base64') : outBuff;
		}

		// Copy chunk
		outBuff.writeInt32BE(length, outOffset);
		outOffset += 4;
		outBuff.writeInt32BE(type, outOffset);
		outOffset += 4;
		origBuff.copy(outBuff, outOffset, inOffset, inOffset + length + 4);

		inOffset += length + 4;
		outOffset += length + 4;
	}

	throw new ExportError('IDAT chunk not found');
}

/**
 * Merge multiple PDFs into one
 */
async function mergePdfs(pdfFiles: Buffer[], xml?: string | null): Promise<Buffer> {
	if (pdfFiles.length === 1) {
		const pdfDoc = await PDFDocument.load(pdfFiles[0]);
		pdfDoc.setCreator('diagrams.net');

		if (xml != null) {
			pdfDoc.setSubject(
				encodeURIComponent(xml).replace(/\(/g, '\\(').replace(/\)/g, '\\)')
			);
		}

		const pdfBytes = await pdfDoc.save();
		return Buffer.from(pdfBytes);
	}

	try {
		const pdfDoc = await PDFDocument.create();
		pdfDoc.setCreator('diagrams.net');

		if (xml != null) {
			await pdfDoc.attach(Buffer.from(xml).toString('base64'), 'diagram.xml', {
				mimeType: 'application/vnd.jgraph.mxfile',
				description: 'Diagram Content'
			});
		}

		for (let i = 0; i < pdfFiles.length; i++) {
			try {
				const pdfFile = await PDFDocument.load(pdfFiles[i]);
				const pages = await pdfDoc.copyPages(pdfFile, pdfFile.getPageIndices());
				pages.forEach(p => pdfDoc.addPage(p));
			} catch (innerError) {
				log.error(`Failed to load PDF part ${i}`, 'ExportService', { error: (innerError as Error).message });
				throw new ExportError(`Failed to process page ${i + 1}. The file may be corrupt.`);
			}
		}

		const pdfBytes = await pdfDoc.save();
		return Buffer.from(pdfBytes);
	} catch (e) {
		throw new ExportError('Error during PDF combination: ' + (e as Error).message);
	}
}

/**
 * Main export function
 */
export function exportDiagram(
	event: any,
	args: ExportArgs,
	codeDir: string,
	__dirname: string,
	parentWindow: BrowserWindow | null,
	directFinalize: boolean = false,
	__DEV__: boolean = false
): void {
	const endTimer = logger.startTimer('exportDiagram', 'ExportService');

	let browser: BrowserWindow | null = null;

	try {
		browser = new BrowserWindow({
			webPreferences: {
				preload: `${__dirname}/electron-preload.js`,
				backgroundThrottling: false,
				contextIsolation: true,
				disableBlinkFeatures: 'Auxclick',
				offscreen: true
			},
			show: false,
			frame: false,
			enableLargerThanScreen: true,
			transparent: args.format === 'png' && (args.bg == null || args.bg === 'none'),
			parent: parentWindow || undefined
		});

		browser.loadURL(`file://${codeDir}/export3.html`);

		const contents = browser.webContents;
		let from = args.from ?? 0;
		let to = args.to ?? 0;
		const pdfs: Buffer[] = [];

		contents.on('did-finish-load', () => {
			// Set up finalize function
			const finalize = () => {
				if (browser) {
					browser.destroy();
					browser = null;
				}
				endTimer();
			};

			if (directFinalize) {
				event.finalize = finalize;
			} else {
				ipcMain.once('export-finalize', finalize);
			}

			// Handle render completion
			const renderingFinishHandler = async (e: any, renderInfo: RenderInfo) => {
				if (renderInfo == null) {
					event.reply('export-error');
					return;
				}

				let bounds: { width: number; height: number; x: number; y: number } | null = null;
				try {
					bounds = JSON.parse(renderInfo.bounds);
				} catch (e) {
					bounds = null;
				}

				const hasError = !bounds || bounds.width < 5 || bounds.height < 5;

				if (hasError) {
					event.reply('export-error');
					return;
				}

				const base64encoded = args.base64 === '1';

				if (args.format === 'png' || args.format === 'jpg' || args.format === 'jpeg') {
					await handleImageExport(browser!, event, args, bounds, base64encoded);
				} else if (args.format === 'pdf') {
					await handlePdfExport(browser!, event, args, renderInfo, from, to, pdfs, base64encoded);
				} else if (args.format === 'svg') {
					handleSvgExport(contents, event);
				} else if (args.format === 'xml') {
					handleXmlExport(contents, event);
				} else {
					event.reply('export-error', 'Error: Unsupported format');
				}
			};

			ipcMain.once('render-finished', renderingFinishHandler);

			// Set up XML data handler for XML format
			if (args.format === 'xml') {
				ipcMain.once('xml-data', (e, data) => {
					event.reply('export-success', data);
				});

				ipcMain.once('xml-data-error', () => {
					event.reply('export-error');
				});
			}

			// Prepare args and send render command
			const renderArgs = {
				...args,
				border: args.border || 0,
				scale: args.scale || 1
			};

			// Process filename
			if (args.filename) {
				let filename = decodeURIComponent(args.filename);
				if (filename.endsWith('.pdf')) {
					filename = filename.slice(0, -4);
				}
				if (filename.endsWith('.drawio')) {
					filename = filename.slice(0, -7);
				}
				(renderArgs as any).fileTitle = filename;
			}

			contents.send('render', renderArgs);
		});
	} catch (e) {
		if (browser) {
			browser.destroy();
		}
		log.exception(e as Error, 'ExportService');
		event.reply('export-error', e);
	}
}

/**
 * Handle image export (PNG/JPEG)
 */
async function handleImageExport(
	browser: BrowserWindow,
	event: any,
	args: ExportArgs,
	bounds: { width: number; height: number; x: number; y: number },
	base64encoded: boolean
): Promise<void> {
	const newBounds = {
		width: Math.ceil(bounds.width + bounds.x) + 1,
		height: Math.ceil(bounds.height + bounds.y) + 1
	};
	browser.setBounds(newBounds);

	// Wait for render (simplified - consider using requestAnimationFrame in future)
	const delay = newBounds.width * newBounds.height < LARGE_IMAGE_AREA ? 1000 : 5000;

	await new Promise(resolve => setTimeout(resolve, delay));

	const img = await browser.capturePage();

	// Calculate scale
	let tScale = 1;
	if (args.h) {
		tScale = args.h / newBounds.height;
	} else if (args.w) {
		tScale = args.w / newBounds.width;
	}

	newBounds.width *= tScale;
	newBounds.height *= tScale;

	const resizedImg = img.resize(newBounds);
	let data: Buffer = args.format === 'png'
		? resizedImg.toPNG()
		: resizedImg.toJPEG(args.jpegQuality || 90);

	// Add DPI metadata for PNG
	if (args.dpi && args.format === 'png') {
		data = writePngWithText(data, 'dpi', args.dpi, false, false) as Buffer;
	}

	// Embed XML for PNG
	if (args.embedXml === '1' && args.format === 'png' && args.xml) {
		data = writePngWithText(data, 'mxGraphModel', args.xml, true, base64encoded) as Buffer;
	} else if (base64encoded) {
		data = Buffer.from(data.toString('base64'));
	}

	event.reply('export-success', data);
}

/**
 * Handle PDF export
 */
async function handlePdfExport(
	browser: BrowserWindow,
	event: any,
	args: ExportArgs,
	renderInfo: RenderInfo,
	from: number,
	to: number,
	pdfs: Buffer[],
	base64encoded: boolean
): Promise<void> {
	const contents = browser.webContents;

	if (args.print) {
		const pdfOptions = {
			scaleFactor: args.pageScale,
			printBackground: true,
			pageSize: {
				width: (args.pageWidth || 0) * MICRON_TO_PIXEL,
				height: ((args.pageHeight || 0) * 1.025) * MICRON_TO_PIXEL
			},
			margins: { marginType: 'none' as const }
		};

		contents.print(pdfOptions, (success, errorType) => {
			event.reply('export-success', {});
		});
	} else {
		const pdfOptions = {
			preferCSSPageSize: true,
			printBackground: true
		};

		try {
			const data = await contents.printToPDF(pdfOptions);
			pdfs.push(data);

			const pageCount = renderInfo.pageCount;
			const toPage = to > pageCount ? pageCount : to;

			if (from < toPage) {
				from++;
				const nextArgs = { ...args, from, to: from };
				ipcMain.once('render-finished', async (e, nextRenderInfo) => {
					await handlePdfExport(browser, event, nextArgs, nextRenderInfo, from, toPage, pdfs, base64encoded);
				});
				contents.send('render', nextArgs);
			} else {
				const merged = await mergePdfs(pdfs, args.embedXml === '1' ? args.xml : null);
				event.reply('export-success', base64encoded ? merged.toString('base64') : merged);
			}
		} catch (error) {
			event.reply('export-error', error);
		}
	}
}

/**
 * Handle SVG export
 */
function handleSvgExport(contents: Electron.WebContents, event: any): void {
	contents.send('get-svg-data');

	ipcMain.once('svg-data', (e, data) => {
		event.reply('export-success', data);
	});
}

/**
 * Handle XML export
 */
function handleXmlExport(contents: Electron.WebContents, event: any): void {
	// Handled by render-finished handler
}
