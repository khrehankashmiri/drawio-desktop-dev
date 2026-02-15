/**
 * Type definitions for draw.io Desktop
 * Provides TypeScript interfaces for IPC communication and core types
 */

// IPC Request/Response Types
export interface IPCRequest {
	action: string;
	reqId?: number;
	[key: string]: any;
}

export interface IPCResponse {
	success?: boolean;
	error?: boolean;
	msg?: string;
	data?: any;
	e?: Error;
	reqId?: number;
}

// File Operations
export interface FileObject {
	path: string;
	encoding?: string;
	draftFileName?: string;
}

export interface FileDraft {
	data: string;
	created: number;
	modified: number;
	path: string;
}

export interface FileStat {
	mtimeMs: number;
	ctimeMs: number;
	[key: string]: any;
}

// Export Options
export interface ExportArgs {
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
	extras?: string;
	theme?: string;
	linkTarget?: string;
	dpi?: string;
}

// Window State
export interface WindowState {
	width: number;
	height: number;
	x?: number;
	y?: number;
	maximized?: boolean;
	fullscreen?: boolean;
}

// App Configuration
export interface AppConfig {
	dev: boolean;
	test: boolean;
	gapi: number;
	db: number;
	od: number;
	gh: number;
	gl: number;
	tr: number;
	browser: number;
	picker: number;
	mode: string;
	export: string;
	disableUpdate: number;
	enableSpellCheck: number;
	enableStoreBkp: number;
	isGoogleFontsEnabled: number;
	appLang?: string;
}

// Plugin Types
export interface PluginInfo {
	pluginName: string;
	selDir: string;
}

// Dialog Options
export interface DialogFilters {
	name: string;
	extensions: string[];
}

// Event Types
export interface IsModifiedData {
	uniqueId: string;
	isModified: boolean;
	draftPath?: string;
}

export interface RenderInfo {
	pageCount: number;
	bounds: string;
}

// Auto Update
export interface UpdateInfo {
	version: string;
	files: any[];
	path: string;
	sha2: string;
	sha512: string;
	releaseName: string;
	releaseNotes: string;
	releaseDate: string;
	stagingPercentage: number;
}

// CLI Options (Commander.js)
export interface CLIOptions {
	create?: boolean;
	check?: boolean;
	export?: boolean;
	recursive?: boolean;
	output?: string;
	format?: string;
	quality?: number;
	transparent?: boolean;
	embedDiagram?: boolean;
	embedSvgImages?: boolean;
	embedSvgFonts?: boolean;
	border?: number;
	scale?: number;
	width?: number;
	height?: number;
	crop?: boolean;
	allPages?: boolean;
	pageIndex?: number;
	layers?: string;
	pageRange?: number[];
	uncompressed?: boolean;
	zoom?: number;
	svgTheme?: string;
	svgLinksTarget?: string;
	enablePlugins?: boolean;
}
